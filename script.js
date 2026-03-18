const apiKey = "a4fed21f7c5145be28386582bfe10489";

const cityInput = document.getElementById("city");
const result = document.getElementById("result");
const searchBtn = document.getElementById("searchBtn");
const locationBtn = document.getElementById("locationBtn");
const recentSearches = document.getElementById("recentSearches");
const clearRecentBtn = document.getElementById("clearRecentBtn");

searchBtn.addEventListener("click", () => {
  getWeatherByPlace(cityInput.value.trim());
});

locationBtn.addEventListener("click", getWeatherByLocation);

cityInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    getWeatherByPlace(cityInput.value.trim());
  }
});

recentSearches.addEventListener("change", () => {
  const selectedPlace = recentSearches.value;
  if (selectedPlace) {
    cityInput.value = selectedPlace;
    getWeatherByPlace(selectedPlace);
  }
});

clearRecentBtn.addEventListener("click", () => {
  localStorage.removeItem("recentPlaces");
  localStorage.removeItem("lastPlace");
  loadRecentSearches();
  cityInput.value = "";
});

window.addEventListener("load", () => {
  loadRecentSearches();

  const lastPlace = localStorage.getItem("lastPlace");
  if (lastPlace) {
    cityInput.value = lastPlace;
    getWeatherByPlace(lastPlace);
  }
});

async function getWeatherByPlace(place) {
  if (!place) {
    showError("Please enter a village, city, or district name.");
    return;
  }

  showLoading("Searching location and weather...");

  try {
    let weatherData = await fetchWeatherByCityName(place);

    if (weatherData) {
      saveRecentSearch(place);
      displayWeather(weatherData, `${weatherData.name}, ${weatherData.sys.country}`, "Matched by weather city search");
      return;
    }

    let geoLocation = await fetchOpenWeatherGeocode(place);

    if (!geoLocation) {
      geoLocation = await fetchNominatimIndia(place);
    }

    if (!geoLocation) {
      showError("Place not found. Try village, mandal, district, state, India.");
      return;
    }

    weatherData = await fetchWeatherByCoords(geoLocation.lat, geoLocation.lon);

    if (!weatherData) {
      showError("Weather data not available for this location.");
      return;
    }

    const displayName = geoLocation.displayName || weatherData.name || place;
    saveRecentSearch(displayName);
    displayWeather(weatherData, displayName, geoLocation.source);
  } catch (error) {
    console.error(error);
    showError("Something went wrong. Please try again.");
  }
}

async function getWeatherByLocation() {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser.");
    return;
  }

  showLoading("Getting your current location...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;

        const weatherData = await fetchWeatherByCoords(lat, lon);

        if (!weatherData) {
          showError("Unable to fetch weather for your current location.");
          return;
        }

        const reverseName = await reverseGeocodeIndia(lat, lon);
        const displayName =
          reverseName ||
          weatherData.name ||
          `${weatherData.coord.lat}, ${weatherData.coord.lon}`;

        saveRecentSearch(displayName);
        displayWeather(weatherData, displayName, "Current device location");
      } catch (error) {
        console.error(error);
        showError("Something went wrong while fetching location weather.");
      }
    },
    () => {
      showError("Location access denied.");
    }
  );
}

async function fetchWeatherByCityName(place) {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(place)}&appid=${apiKey}&units=metric`;

  const res = await fetch(url);
  const data = await res.json();

  if (String(data.cod) === "200") {
    return data;
  }

  return null;
}

async function fetchOpenWeatherGeocode(place) {
  const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(place + ", India")}&limit=5&appid=${apiKey}`;

  const res = await fetch(geoUrl);
  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const indiaMatch = data.find((item) => item.country === "IN") || data[0];

  return {
    lat: indiaMatch.lat,
    lon: indiaMatch.lon,
    displayName: buildOpenWeatherPlaceName(indiaMatch),
    source: "Matched by India geocoding"
  };
}

async function fetchNominatimIndia(place) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=5&q=${encodeURIComponent(place)}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const best = data[0];

  return {
    lat: parseFloat(best.lat),
    lon: parseFloat(best.lon),
    displayName: shortenDisplayName(best.display_name),
    source: "Matched by map search"
  };
}

async function reverseGeocodeIndia(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    const data = await res.json();
    const address = data.address || {};

    const shortName =
      address.village ||
      address.town ||
      address.city ||
      address.suburb ||
      address.county ||
      address.state_district ||
      data.name ||
      "";

    const state = address.state || "";

    if (shortName && state) {
      return `${shortName}, ${state}, India`;
    }

    if (shortName) {
      return `${shortName}, India`;
    }

    if (data.display_name) {
      return data.display_name.split(",").slice(0, 3).join(", ");
    }
  } catch (error) {
    console.error("Reverse geocode error:", error);
  }

  return null;
}

async function fetchWeatherByCoords(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;

  const res = await fetch(url);
  const data = await res.json();

  if (String(data.cod) === "200") {
    return data;
  }

  return null;
}

function buildOpenWeatherPlaceName(placeObj) {
  const parts = [];

  if (placeObj.name) parts.push(placeObj.name);
  if (placeObj.state) parts.push(placeObj.state);
  if (placeObj.country) parts.push(placeObj.country);

  return parts.join(", ");
}

function shortenDisplayName(displayName) {
  if (!displayName) return "";
  return displayName.split(",").slice(0, 4).join(", ");
}

function displayWeather(data, displayPlace, sourceText) {
  result.classList.remove("hidden");

  const weatherMain = data.weather[0].main;
  const weatherDescription = data.weather[0].description;
  const iconCode = data.weather[0].icon;
  const iconUrl = `https://openweathermap.org/img/wn/${iconCode}@4x.png`;

  const currentDate = new Date().toLocaleString();
  const sunrise = new Date(data.sys.sunrise * 1000).toLocaleTimeString();
  const sunset = new Date(data.sys.sunset * 1000).toLocaleTimeString();
  const visibilityKm = data.visibility ? (data.visibility / 1000).toFixed(1) + " km" : "N/A";

  result.innerHTML = `
    <h2 class="city-name">${displayPlace}</h2>
    <p class="date-time">🕒 ${currentDate}</p>
    <p class="place-source">📍 ${sourceText}</p>

    <img
      class="weather-icon"
      src="${iconUrl}"
      alt="${weatherDescription}"
      onerror="this.style.display='none'"
    >

    <p class="temp">${Math.round(data.main.temp)}°C</p>
    <p class="weather-main">${weatherMain} - ${weatherDescription}</p>

    <div class="details-grid">
      <div class="detail-box">
        <p class="detail-title">Feels Like</p>
        <p class="detail-value">🌡️ ${Math.round(data.main.feels_like)}°C</p>
      </div>

      <div class="detail-box">
        <p class="detail-title">Humidity</p>
        <p class="detail-value">💧 ${data.main.humidity}%</p>
      </div>

      <div class="detail-box">
        <p class="detail-title">Wind Speed</p>
        <p class="detail-value">🌬️ ${data.wind.speed} m/s</p>
      </div>

      <div class="detail-box">
        <p class="detail-title">Pressure</p>
        <p class="detail-value">📍 ${data.main.pressure} hPa</p>
      </div>

      <div class="detail-box">
        <p class="detail-title">Sunrise</p>
        <p class="detail-value">🌅 ${sunrise}</p>
      </div>

      <div class="detail-box">
        <p class="detail-title">Sunset</p>
        <p class="detail-value">🌇 ${sunset}</p>
      </div>

      <div class="detail-box">
        <p class="detail-title">Visibility</p>
        <p class="detail-value">👀 ${visibilityKm}</p>
      </div>

      <div class="detail-box">
        <p class="detail-title">Coordinates</p>
        <p class="detail-value">📌 ${data.coord.lat}, ${data.coord.lon}</p>
      </div>
    </div>

    <p class="footer-note">Supports village and city search with coordinate fallback</p>
  `;

  changeBackground(weatherMain);
}

function showLoading(message) {
  result.classList.remove("hidden");
  result.innerHTML = `
    <div class="loader"></div>
    <p class="loading-text">${message}</p>
  `;
}

function showError(message) {
  result.classList.remove("hidden");
  result.innerHTML = `<p class="error">${message}</p>`;
}

function changeBackground(weatherType) {
  const type = weatherType.toLowerCase();

  if (type.includes("clear")) {
    document.body.style.background = "linear-gradient(135deg, #1e3a8a, #2563eb, #38bdf8)";
  } else if (type.includes("cloud")) {
    document.body.style.background = "linear-gradient(135deg, #334155, #475569, #64748b)";
  } else if (type.includes("rain") || type.includes("drizzle")) {
    document.body.style.background = "linear-gradient(135deg, #0f172a, #155e75, #0891b2)";
  } else if (type.includes("thunderstorm")) {
    document.body.style.background = "linear-gradient(135deg, #111827, #312e81, #4c1d95)";
  } else if (type.includes("snow")) {
    document.body.style.background = "linear-gradient(135deg, #94a3b8, #cbd5e1, #e2e8f0)";
  } else if (type.includes("mist") || type.includes("fog") || type.includes("haze")) {
    document.body.style.background = "linear-gradient(135deg, #1f2937, #374151, #6b7280)";
  } else {
    document.body.style.background = "linear-gradient(135deg, #0f2027, #203a43, #2c5364)";
  }
}

function saveRecentSearch(place) {
  localStorage.setItem("lastPlace", place);

  let places = JSON.parse(localStorage.getItem("recentPlaces")) || [];
  places = places.filter((item) => item.toLowerCase() !== place.toLowerCase());
  places.unshift(place);

  if (places.length > 6) {
    places = places.slice(0, 6);
  }

  localStorage.setItem("recentPlaces", JSON.stringify(places));
  loadRecentSearches();
}

function loadRecentSearches() {
  const places = JSON.parse(localStorage.getItem("recentPlaces")) || [];
  recentSearches.innerHTML = `<option value="">Select a place</option>`;

  places.forEach((place) => {
    const option = document.createElement("option");
    option.value = place;
    option.textContent = place;
    recentSearches.appendChild(option);
  });
}