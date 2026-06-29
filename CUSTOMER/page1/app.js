/*
 * HomeHelp — Login / Sign up screen logic
 * Implements functional requirements & test cases from CUSTOMER_LOGIN_PAGE_1.docx
 *
 *  - Mobile number: 10 digits, numeric only, default country code +91
 *  - Continue button disabled until a valid number is entered
 *  - Inline validation errors (empty / invalid / non-numeric)
 *  - "Send OTP" simulation -> navigates to OTP verification screen (otp.html)
 *  - Continue with Google (mock) and Terms / Privacy links
 */

(function () {
  "use strict";

  var COUNTRY_CODE = "+91";
  var PHONE_LENGTH = 10;

  var form = document.getElementById("login-form");
  var field = document.getElementById("phone-field");
  var input = document.getElementById("phone");
  var errorEl = document.getElementById("phone-error");
  var continueBtn = document.getElementById("continue-btn");
  var googleBtn = document.getElementById("google-btn");

  /* ---------- Helpers ---------- */

  function isValidPhone(value) {
    // Indian mobile numbers: 10 digits, first digit 6-9
    return /^[6-9]\d{9}$/.test(value);
  }

  function setError(message) {
    errorEl.textContent = message || "";
    field.classList.toggle("invalid", !!message);
  }

  function refreshButton() {
    continueBtn.disabled = !isValidPhone(input.value);
  }

  function showToast(message) {
    var toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    // force reflow so the transition runs
    void toast.offsetWidth;
    toast.classList.add("show");
    setTimeout(function () {
      toast.classList.remove("show");
      setTimeout(function () { toast.remove(); }, 250);
    }, 2200);
  }

  /* ---------- Input handling (TC-04: numbers only) ---------- */

  input.addEventListener("input", function () {
    // strip everything that is not a digit, cap at 10 chars
    var cleaned = input.value.replace(/\D/g, "").slice(0, PHONE_LENGTH);
    if (cleaned !== input.value) {
      input.value = cleaned;
    }
    if (errorEl.textContent) {
      setError(""); // clear stale error while typing
    }
    refreshButton();
  });

  // Block non-numeric keystrokes early (lets control keys through)
  input.addEventListener("keypress", function (e) {
    if (e.key.length === 1 && !/\d/.test(e.key)) {
      e.preventDefault();
    }
  });

  input.addEventListener("focus", function () { field.classList.add("focus"); });
  input.addEventListener("blur", function () { field.classList.remove("focus"); });

  /* ---------- Submit / Send OTP ---------- */

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var value = input.value.trim();

    // TC-02: empty number
    if (value.length === 0) {
      setError("Please enter mobile number.");
      return;
    }
    // TC-03: invalid number
    if (!isValidPhone(value)) {
      setError("Enter valid 10-digit mobile number.");
      return;
    }

    setError("");
    sendOtp(value);
  });

  function sendOtp(phone) {
    // Disable button while "sending" to avoid duplicate OTP requests
    continueBtn.disabled = true;
    var original = continueBtn.textContent;
    continueBtn.textContent = "Sending OTP...";

    // Simulated SMS gateway call. Replace with real API integration.
    simulateOtpApi(phone)
      .then(function () {
        // TC-05: OTP sent -> move to OTP verification screen
        var url = "otp.html?phone=" + encodeURIComponent(COUNTRY_CODE + phone);
        window.location.href = url;
      })
      .catch(function () {
        // TC-08: OTP send failure
        continueBtn.textContent = original;
        refreshButton();
        showToast("Unable to send OTP. Please try again.");
      });
  }

  // Mock backend: resolves ~95% of the time so TC-08 can also be observed.
  function simulateOtpApi(phone) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        var ok = Math.random() > 0.05;
        if (ok) {
          try { sessionStorage.setItem("hh_otp_phone", phone); } catch (_) {}
          resolve();
        } else {
          reject(new Error("sms_gateway_unavailable"));
        }
      }, 600);
    });
  }

  /* ---------- Continue with Google (TC-09 / TC-10) ---------- */

  googleBtn.addEventListener("click", function () {
    // Placeholder for Google Identity Services / OAuth flow.
    showToast("Opening Google sign-in...");
    // Real implementation would launch the Google auth popup here and,
    // on success, route to Home (existing user) or profile setup (new user).
  });

  /* ---------- Init ---------- */
  refreshButton();
})();
