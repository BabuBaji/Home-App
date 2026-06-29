# HomeHelp — Customer Login / Sign up (Page 1)

Implementation of the **CUSTOMER_LOGIN_PAGE_1** screen, based on the
`CUSTOMER_1_SLIDE.png` mockup and the `CUSTOMER_LOGIN_PAGE_1.docx` user story.

## Run

No build step or dependencies. Just open the page in a browser:

```
page1/index.html
```

(Optionally serve the folder, e.g. `python -m http.server` from `page1/`, then
visit http://localhost:8000.)

## Files

| File           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `index.html`   | Login / Sign up screen (matches the mockup)                    |
| `styles.css`   | Purple HomeHelp theme + phone frame                            |
| `app.js`       | Mobile validation, Continue/Send-OTP flow, Google placeholder  |
| `otp.html`     | OTP verification screen (next step in the flow)                |
| `terms.html`   | Terms & Conditions page (opened from the link)                 |
| `privacy.html` | Privacy Policy page (opened from the link)                     |

## Flow

```
Open app → Enter mobile number → Continue → OTP screen → Verify → Home
        └→ Continue with Google → (authenticate) → Home / Profile setup
```

## Functional requirements covered

- Country code default `+91`, phone icon, 10-digit mobile input
- Numeric-only input (letters/symbols blocked on keypress and stripped on paste)
- Continue button disabled until a valid 10-digit number (`[6-9]` + 9 digits) is entered
- Inline error messages
- "Send OTP" simulation → navigates to the OTP verification screen
- Continue with Google (placeholder for Google Identity Services / OAuth)
- Clickable Terms & Conditions and Privacy Policy links
- OTP screen: 6-digit entry, 5-minute expiry, max 5 attempts, resend rate-limit (30s)

## Test case mapping (from the spec)

| TC    | Scenario                  | Where handled                                              |
| ----- | ------------------------- | --------------------------------------------------------- |
| TC-01 | Screen load               | `index.html` renders logo, title, input, buttons, terms   |
| TC-02 | Empty mobile number       | `app.js` → "Please enter mobile number."                  |
| TC-03 | Invalid mobile number     | `app.js` → "Enter valid 10-digit mobile number."          |
| TC-04 | Alphabet input            | `app.js` keypress/`input` handlers reject non-digits       |
| TC-05 | Valid number → Continue   | `app.js` `sendOtp()` → redirect to `otp.html`             |
| TC-06 | Existing user login       | OTP verified → Home (placeholder alert)                   |
| TC-07 | New user sign up          | Same OTP path; route to profile setup in real backend     |
| TC-08 | OTP send failure          | `simulateOtpApi` reject → "Unable to send OTP…" toast      |
| TC-09 | Google login success      | `google-btn` handler (placeholder)                        |
| TC-10 | Google login cancelled    | Stays on screen (no navigation)                           |
| TC-11 | Terms link                | `terms.html`                                              |
| TC-12 | Privacy Policy link       | `privacy.html`                                            |

## Notes for backend integration

The OTP send/verify and Google sign-in are **mocked** on the client. Replace:

- `simulateOtpApi(phone)` in `app.js` with your real SMS/OTP gateway call.
- The demo OTP `123456` and verification logic in `otp.html` with a backend verify call.
- The Google button handler with Google Identity Services; validate the token server-side.

Security criteria from the spec (OTP 5-min expiry, attempt limits, resend rate-limit,
no OTP in logs, masked mobile, server-side Google token validation) should be enforced
on the backend — the client-side checks here are demonstrative.
