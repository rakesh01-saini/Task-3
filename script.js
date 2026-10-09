
/* =========================================
   SkyRoute - Weather & Travel Planner
   JavaScript + Open-Meteo Weather API
========================================= */

const $ = (selector) => document.querySelector(selector);

// DOM Elements
const searchForm = $("#searchForm");
const cityInput = $("#cityInput");
const searchBtn = $("#searchBtn");
const searchStatus = $("#searchStatus");
const unitToggle = $("#unitToggle");
const favoriteBtn = $("#favoriteBtn");
const locateBtn = $("#locateBtn");

let currentLocation = {
    name: "Bhopal",
    country: "India",
    latitude: 23.2599,
    longitude: 77.4126
};

let currentWeather = null;
let isCelsius = true;
let savedTrips = loadStorage("skyroute-trips", []);
let savedCities = loadStorage("skyroute-cities", []);
let toastTimer;

// =========================================
// LOCAL STORAGE HELPERS
// =========================================

function loadStorage(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

function saveStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        showToast("Unable to save data in this browser.");
    }
}

// =========================================
// NOTIFICATION / TOAST
// =========================================

function showToast(message) {
    document.querySelector(".toast")?.remove();
    clearTimeout(toastTimer);

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;

    document.body.appendChild(toast);

    toastTimer = setTimeout(() => {
        toast.remove();
    }, 3000);
}

function setSearchStatus(message, error = false) {
    searchStatus.textContent = message;
    searchStatus.style.color = error
        ? "#ff9baa"
        : "var(--cyan)";
}

// =========================================
// WEATHER CONDITION DETAILS
// =========================================

function weatherInfo(code, isDay = true) {
    if (code === 0) {
        return {
            label: "Clear sky",
            icon: isDay ? "☀️" : "🌙",
            tip: "Clear skies are great for outdoor activities."
        };
    }

    if (code === 1) {
        return {
            label: "Mainly clear",
            icon: isDay ? "🌤️" : "☁️",
            tip: "Enjoy the outdoors and keep a light layer handy."
        };
    }

    if (code === 2) {
        return {
            label: "Partly cloudy",
            icon: "⛅",
            tip: "A comfortable day for sightseeing may be ahead."
        };
    }

    if (code === 3) {
        return {
            label: "Overcast",
            icon: "☁️",
            tip: "Keep a light jacket handy for your journey."
        };
    }

    if ([45, 48].includes(code)) {
        return {
            label: "Foggy",
            icon: "🌫️",
            tip: "Visibility may be low. Take care while travelling."
        };
    }

    if ([51, 53, 55, 56, 57].includes(code)) {
        return {
            label: "Drizzle",
            icon: "🌦️",
            tip: "Carry an umbrella or a light rain jacket."
        };
    }

    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
        return {
            label: "Rain showers",
            icon: "🌧️",
            tip: "Pack rain protection and keep electronics dry."
        };
    }

    if ([71, 73, 75, 77, 85, 86].includes(code)) {
        return {
            label: "Snow",
            icon: "❄️",
            tip: "Carry warm clothes and suitable footwear."
        };
    }

    if ([95, 96, 99].includes(code)) {
        return {
            label: "Thunderstorm",
            icon: "⛈️",
            tip: "Check official weather alerts before outdoor travel."
        };
    }

    return {
        label: "Variable conditions",
        icon: "🌤️",
        tip: "Check the forecast before starting your journey."
    };
}

// =========================================
// TEMPERATURE AND DATE HELPERS
// =========================================

function convertTemp(celsius) {
    if (celsius == null || !Number.isFinite(Number(celsius))) {
        return "--";
    }

    const value = isCelsius
        ? Number(celsius)
        : Number(celsius) * 9 / 5 + 32;

    return Math.round(value);
}

function tempLabel(value) {
    return `${convertTemp(value)}°${isCelsius ? "C" : "F"}`;
}

function formatTime(value) {
    if (!value) return "--:--";

    return new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatDay(value, options = { weekday: "short" }) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(
        undefined,
        options
    );
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

// =========================================
// FETCH API DATA
// =========================================

async function getJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }

    return response.json();
}

// =========================================
// SEARCH CITY
// =========================================

async function searchCity(city) {
    const query = city.trim();

    if (!query) {
        setSearchStatus("Please enter a city name.", true);
        return;
    }

    searchBtn.disabled = true;
    searchBtn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i><span>Searching</span>';

    setSearchStatus(`Searching for ${query}...`);

    try {
        const url =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`;

        const result = await getJSON(url);

        if (!result.results || result.results.length === 0) {
            throw new Error("City not found. Try another city name.");
        }

        const cityData =
            result.results.find(item =>
                item.name.toLowerCase() === query.toLowerCase()
            ) || result.results[0];

        await loadWeather({
            name: cityData.name,
            country: cityData.country || "",
            admin1: cityData.admin1 || "",
            latitude: cityData.latitude,
            longitude: cityData.longitude
        });

        cityInput.value = "";

    } catch (error) {
        setSearchStatus(error.message, true);
    } finally {
        searchBtn.disabled = false;
        searchBtn.innerHTML =
            '<i class="fa-solid fa-arrow-right"></i><span>Explore</span>';
    }
}

searchForm.addEventListener("submit", event => {
    event.preventDefault();
    searchCity(cityInput.value);
});

// =========================================
// LOAD WEATHER FROM OPEN-METEO API
// =========================================

async function loadWeather(location) {
    setSearchStatus(`Loading weather for ${location.name}...`);

    try {
        const params = new URLSearchParams({
            latitude: location.latitude,
            longitude: location.longitude,

            current: [
                "temperature_2m",
                "relative_humidity_2m",
                "apparent_temperature",
                "is_day",
                "weather_code",
                "wind_speed_10m"
            ].join(","),

            daily: [
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_probability_max",
                "sunrise",
                "sunset"
            ].join(","),

            hourly: "visibility",
            forecast_days: "5",
            timezone: "auto"
        });

        const data = await getJSON(
            `https://api.open-meteo.com/v1/forecast?${params}`
        );

        if (!data.current || !data.daily) {
            throw new Error("Weather information is unavailable.");
        }

        currentLocation = location;
        currentWeather = data;

        renderWeather();
        renderForecast();
        renderAdvice();
        updateFavoriteButton();

        const localDate = new Date().toLocaleString([], {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: data.timezone
        });

        $("#weatherDate").textContent = `Local time · ${localDate}`;

        setSearchStatus(`Weather updated for ${location.name}.`);

    } catch (error) {
        setSearchStatus(
            "Unable to load weather. Check your internet and try again.",
            true
        );

        showToast(error.message);
    }
}

// =========================================
// DISPLAY CURRENT WEATHER
// =========================================

function renderWeather() {
    const data = currentWeather;
    const now = data.current;
    const daily = data.daily;

    const info = weatherInfo(
        now.weather_code,
        now.is_day === 1
    );

    const locationName = [
        currentLocation.name,
        currentLocation.admin1,
        currentLocation.country
    ].filter(Boolean).join(", ");

    $("#cityName").textContent = locationName;
    $("#currentIcon").textContent = info.icon;

    $("#currentTemp").innerHTML =
        `${convertTemp(now.temperature_2m)}<span>°${isCelsius ? "C" : "F"}</span>`;

    $("#conditionText").textContent = info.label;

    $("#todayHigh").textContent =
        tempLabel(daily.temperature_2m_max[0]);

    $("#todayLow").textContent =
        tempLabel(daily.temperature_2m_min[0]);

    $("#feelsLike").textContent =
        tempLabel(now.apparent_temperature);

    $("#humidity").textContent =
        `${now.relative_humidity_2m}%`;

    $("#windSpeed").textContent =
        `${Math.round(now.wind_speed_10m)} km/h`;

    // Find visibility for the current local hour.
    const times = data.hourly?.time || [];
    const visibilityValues = data.hourly?.visibility || [];

    let index = times.findIndex(time => time >= now.time);

    if (index < 0) index = 0;

    const visibility = visibilityValues[index];

    $("#visibility").textContent =
        Number.isFinite(visibility)
            ? `${(visibility / 1000).toFixed(1)} km`
            : "-- km";

    $("#sunrise").textContent =
        formatTime(daily.sunrise?.[0]);

    $("#sunset").textContent =
        formatTime(daily.sunset?.[0]);

    if (daily.sunrise?.[0] && daily.sunset?.[0]) {
        const sunrise = new Date(daily.sunrise[0]);
        const sunset = new Date(daily.sunset[0]);

        const hours = (sunset - sunrise) / 3600000;

        $("#daylightText").textContent =
            `${hours.toFixed(1)} hours of daylight expected`;
    }
}

// =========================================
// 5-DAY FORECAST
// =========================================

function renderForecast() {
    const daily = currentWeather.daily;

    $("#forecastGrid").innerHTML = daily.time.map((date, index) => {
        const info = weatherInfo(daily.weather_code[index]);
        const rain = daily.precipitation_probability_max?.[index] ?? 0;

        const dayName = index === 0
            ? "Today"
            : formatDay(date);

        return `
            <article class="forecast-card">
                <div class="forecast-day">
                    ${escapeHTML(dayName)}
                </div>

                <span class="forecast-icon">
                    ${info.icon}
                </span>

                <div class="forecast-desc">
                    ${escapeHTML(info.label)}
                </div>

                <div class="forecast-temps">
                    <span>${tempLabel(daily.temperature_2m_max[index])}</span>
                    <span>${tempLabel(daily.temperature_2m_min[index])}</span>
                </div>

                <div class="forecast-rain">
                    <i class="fa-solid fa-droplet"></i>
                    ${rain}% rain chance
                </div>
            </article>
        `;
    }).join("");
}

// =========================================
// SMART WEATHER TRAVEL TIPS
// =========================================

function renderAdvice() {
    const now = currentWeather.current;
    const info = weatherInfo(now.weather_code, now.is_day === 1);
    const temperature = now.temperature_2m;

    let title = "A good day to explore";
    let tip = info.tip;
    let tags = ["Check forecast", "Stay flexible"];

    if ([61, 63, 65, 80, 81, 82, 95, 96, 99].includes(now.weather_code)) {
        title = "Pack for wet weather";
        tags = ["Rain protection", "Indoor backup"];
    } else if (temperature >= 32) {
        title = "Beat the heat";
        tip = "Carry water, wear breathable clothes and avoid strenuous outdoor activities during the hottest hours.";
        tags = ["Water bottle", "Sun protection"];
    } else if (temperature <= 10) {
        title = "Layer up for comfort";
        tip = "Carry warm clothes and comfortable footwear for your journey.";
        tags = ["Warm layers", "Comfortable shoes"];
    } else if ([0, 1].includes(now.weather_code)) {
        title = "Looks good for exploring";
        tip = "Clear conditions may be suitable for outdoor plans. Carry water and sun protection.";
        tags = ["Outdoor plans", "Sunglasses"];
    }

    $("#tipTitle").textContent = title;
    $("#weatherTip").textContent = tip;

    $("#tipTags").innerHTML = tags.map(tag =>
        `<span>${escapeHTML(tag)}</span>`
    ).join("");
}

// =========================================
// CELSIUS / FAHRENHEIT SWITCH
// =========================================

unitToggle.addEventListener("click", () => {
    isCelsius = !isCelsius;

    unitToggle.textContent = isCelsius ? "°C" : "°F";

    if (currentWeather) {
        renderWeather();
        renderForecast();
    }
});

// =========================================
// SAVE FAVOURITE CITY
// =========================================

function updateFavoriteButton() {
    const exists = savedCities.some(city =>
        city.name === currentLocation.name &&
        city.latitude === currentLocation.latitude &&
        city.longitude === currentLocation.longitude
    );

    favoriteBtn.classList.toggle("saved", exists);

    favoriteBtn.innerHTML = exists
        ? '<i class="fa-solid fa-heart"></i>'
        : '<i class="fa-regular fa-heart"></i>';

    favoriteBtn.setAttribute(
        "aria-label",
        exists ? "Remove saved city" : "Save this city"
    );
}

favoriteBtn.addEventListener("click", () => {
    const exists = savedCities.some(city =>
        city.name === currentLocation.name &&
        city.latitude === currentLocation.latitude &&
        city.longitude === currentLocation.longitude
    );

    if (exists) {
        savedCities = savedCities.filter(city =>
            !(city.name === currentLocation.name &&
              city.latitude === currentLocation.latitude &&
              city.longitude === currentLocation.longitude)
        );

        showToast("City removed from favourites.");

    } else {
        savedCities.unshift({
            name: currentLocation.name,
            country: currentLocation.country,
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude
        });

        savedCities = savedCities.slice(0, 8);

        showToast("City saved to favourites.");
    }

    saveStorage("skyroute-cities", savedCities);
    updateFavoriteButton();
});

// =========================================
// USER'S CURRENT LOCATION
// =========================================

locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
        showToast("Location is not supported. Search for a city.");
        return;
    }

    locateBtn.disabled = true;
    setSearchStatus("Requesting location permission...");

    navigator.geolocation.getCurrentPosition(
        async position => {
            const { latitude, longitude } = position.coords;

            try {
                const url =
                    `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=en&format=json`;

                let place = {
                    name: "Your location",
                    country: ""
                };

                try {
                    const geo = await getJSON(url);
                    const result = geo.results?.[0];

                    if (result) {
                        place = {
                            name: result.name,
                            country: result.country || "",
                            admin1: result.admin1 || ""
                        };
                    }
                } catch {
                    // Weather can still load without a place name.
                }

                await loadWeather({
                    ...place,
                    latitude,
                    longitude
                });

            } finally {
                locateBtn.disabled = false;
            }
        },

        error => {
            locateBtn.disabled = false;

            setSearchStatus(
                error.code === 1
                    ? "Location permission denied. Search for a city instead."
                    : "Could not find your location. Please search for a city.",
                true
            );
        },

        {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000
        }
    );
});

// =========================================
// DESTINATION CARDS
// =========================================

document.querySelectorAll(".destination-card").forEach(card => {
    card.addEventListener("click", () => {
        const city = card.dataset.city;

        cityInput.value = city;
        searchCity(city);

        $("#home").scrollIntoView({
            behavior: "smooth"
        });
    });
});

// =========================================
// TRIP PLANNER
// =========================================

const tripForm = $("#tripForm");
const tripStart = $("#tripStart");
const tripEnd = $("#tripEnd");
const tripDestination = $("#tripDestination");
const tripStyle = $("#tripStyle");

const now = new Date();

const todayISO = new Date(
    now.getTime() - now.getTimezoneOffset() * 60000
).toISOString().slice(0, 10);

tripStart.min = todayISO;
tripEnd.min = todayISO;
tripStart.value = todayISO;
tripEnd.value = todayISO;

$("#todayLabel").textContent = now.toLocaleDateString(
    undefined,
    {
        weekday: "long",
        month: "short",
        day: "numeric"
    }
);

tripStart.addEventListener("change", () => {
    tripEnd.min = tripStart.value || todayISO;

    if (tripEnd.value < tripStart.value) {
        tripEnd.value = tripStart.value;
    }
});

tripForm.addEventListener("submit", event => {
    event.preventDefault();

    const destination = tripDestination.value.trim();

    if (!destination) {
        showToast("Please enter a destination.");
        return;
    }

    if (tripEnd.value < tripStart.value) {
        showToast("End date cannot be before the start date.");
        return;
    }

    const trip = {
        id: crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),

        destination,
        start: tripStart.value,
        end: tripEnd.value,
        style: tripStyle.value
    };

    savedTrips.unshift(trip);
    savedTrips = savedTrips.slice(0, 12);

    saveStorage("skyroute-trips", savedTrips);
    renderTrips();

    tripForm.reset();

    tripStart.value = todayISO;
    tripEnd.value = todayISO;
    tripEnd.min = todayISO;

    showToast(`Trip to ${destination} saved successfully!`);
});

// =========================================
// DISPLAY SAVED TRIPS
// =========================================

function renderTrips() {
    const container = $("#savedTrips");

    $("#tripCount").textContent =
        `${savedTrips.length} ${savedTrips.length === 1 ? "trip" : "trips"}`;

    if (savedTrips.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-suitcase"></i>
                <p>Your saved trip plans will show up here.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = savedTrips.map(trip => `
        <article class="trip-card">
            <div>
                <h4>
                    <i class="fa-solid fa-location-dot"
                       style="color:var(--cyan)"></i>
                    ${escapeHTML(trip.destination)}
                </h4>

                <p>
                    ${escapeHTML(formatDay(trip.start, {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                    }))}
                    –
                    ${escapeHTML(formatDay(trip.end, {
                        day: "numeric",
                        month: "short",
                        year: "numeric"
                    }))}
                </p>

                <p class="trip-style">
                    ${escapeHTML(trip.style)} trip
                </p>
            </div>

            <button
                class="delete-trip"
                type="button"
                data-delete-trip="${escapeHTML(trip.id)}"
                aria-label="Delete trip">
                <i class="fa-solid fa-trash"></i>
            </button>
        </article>
    `).join("");
}

$("#savedTrips").addEventListener("click", event => {
    const button = event.target.closest("[data-delete-trip]");

    if (!button) return;

    savedTrips = savedTrips.filter(
        trip => trip.id !== button.dataset.deleteTrip
    );

    saveStorage("skyroute-trips", savedTrips);
    renderTrips();

    showToast("Trip deleted.");
});

// =========================================
// PACKING CHECKLIST
// =========================================

const checklist = $("#checklist");

const checklistChecks = [
    ...checklist.querySelectorAll('input[type="checkbox"]')
];

const savedChecklist = loadStorage("skyroute-checklist", []);

checklistChecks.forEach((input, index) => {
    input.checked = Boolean(savedChecklist[index]);
});

function updateChecklist() {
    const checked = checklistChecks.filter(
        input => input.checked
    ).length;

    const percentage =
        (checked / checklistChecks.length) * 100;

    $("#checkProgress").style.width = `${percentage}%`;

    $("#checkProgressText").textContent =
        `${checked} of ${checklistChecks.length} packed`;

    saveStorage(
        "skyroute-checklist",
        checklistChecks.map(input => input.checked)
    );
}

checklistChecks.forEach(input => {
    input.addEventListener("change", updateChecklist);
});

$("#resetChecklist").addEventListener("click", () => {
    checklistChecks.forEach(input => {
        input.checked = false;
    });

    updateChecklist();
    showToast("Packing checklist reset.");
});

// =========================================
// RESPONSIVE MOBILE NAVIGATION
// =========================================

const mobileMenu = $("#mobileMenu");
const navLinks = $("#navLinks");

mobileMenu.addEventListener("click", () => {
    const open = navLinks.classList.toggle("open");

    mobileMenu.setAttribute("aria-expanded", String(open));

    mobileMenu.innerHTML = open
        ? '<i class="fa-solid fa-xmark"></i>'
        : '<i class="fa-solid fa-bars"></i>';
});

navLinks.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        navLinks.classList.remove("open");

        mobileMenu.setAttribute("aria-expanded", "false");
        mobileMenu.innerHTML = '<i class="fa-solid fa-bars"></i>';

        navLinks.querySelectorAll("a").forEach(item => {
            item.classList.remove("active");
        });

        link.classList.add("active");
    });
});

// =========================================
// INITIALIZE APPLICATION
// =========================================

updateChecklist();
renderTrips();
loadWeather(currentLocation);
