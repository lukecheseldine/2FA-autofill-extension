// Detect 2FA input fields and offer to autofill them

// Common 2FA field selectors
const TFA_FIELD_SELECTORS = [
    'input[autocomplete="one-time-code"]',
    'input[name*="otp"]',
    'input[name*="code"]',
    'input[placeholder*="code"]',
    'input[placeholder*="verification"]',
    'input[aria-label*="verification"]',
    'input[aria-label*="code"]',
    'input[type="tel"][maxlength="6"]',
    'input[type="number"][maxlength="6"]',
    'input[inputmode="numeric"][maxlength="6"]',
];

// Check for 2FA fields when page loads and on DOM changes
function detectTFAFields() {
    const potentialTFAFields = [];

    // Check all potential selectors
    TFA_FIELD_SELECTORS.forEach((selector) => {
        const fields = document.querySelectorAll(selector);
        fields.forEach((field) => {
            if (!field.dataset.tfaDetected && isLikelyTFAField(field)) {
                potentialTFAFields.push(field);
                field.dataset.tfaDetected = "true";
            }
        });
    });

    if (potentialTFAFields.length > 0) {
        handleTFAFields(potentialTFAFields);
    }
}

// Additional heuristics to determine if a field is likely a 2FA input
function isLikelyTFAField(field) {
    // Check if field has a small max length (typical for 2FA codes)
    if (field.maxLength >= 4 && field.maxLength <= 8) return true;

    // Check if field is near text mentioning verification, code, etc.
    const nearbyText = getNearbyText(field);
    const tfaKeywords = [
        "verification",
        "code",
        "two-factor",
        "2fa",
        "authenticate",
        "security",
    ];
    return tfaKeywords.some((keyword) =>
        nearbyText.toLowerCase().includes(keyword)
    );
}

// Get text near an input field to help with context
function getNearbyText(field) {
    const parent = field.parentElement;
    return parent ? parent.innerText : "";
}

// Handle detected 2FA fields
function handleTFAFields(fields) {
    // Get the current domain to help with email search
    const domain = window.location.hostname;

    // Keep track of polling
    let pollingInterval;

    // Function to request auth code
    function requestAuthCode() {
        chrome.runtime.sendMessage(
            { action: "findAuthCode", domain: domain },
            (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error:", chrome.runtime.lastError);
                    return;
                }

                if (response.success && response.code) {
                    // Create a suggestion UI
                    showCodeSuggestion(fields[0], response.code, () => {
                        // When suggestion is dismissed, stop polling
                        clearInterval(pollingInterval);
                    });
                    // Stop polling once we find a code
                    clearInterval(pollingInterval);
                } else if (response.message === "Not authenticated") {
                    // Show authentication prompt
                    showAuthPrompt(fields[0]);
                    // Stop polling if not authenticated
                    clearInterval(pollingInterval);
                }
            }
        );
    }

    // Initial request
    requestAuthCode();

    // Start polling every 5 seconds
    pollingInterval = setInterval(() => {
        // Check if field is still in the DOM
        if (!document.body.contains(fields[0])) {
            clearInterval(pollingInterval);
            return;
        }
        requestAuthCode();
    }, 5000);

    // Store the interval ID on the field to clean up later if needed
    fields[0].tfaPollingInterval = pollingInterval;
}

// Show a suggestion UI to autofill the code
function showCodeSuggestion(field, code, onDismiss) {
    // Create suggestion element
    const suggestion = document.createElement("div");
    suggestion.className = "tfa-autofill-suggestion";
    suggestion.style.cssText = `
    position: absolute;
    background: #f0f8ff;
    border: 1px solid #4285f4;
    border-radius: 4px;
    padding: 8px 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
    display: flex;
    align-items: center;
  `;

    // Position the suggestion near the field
    const fieldRect = field.getBoundingClientRect();
    suggestion.style.top = `${window.scrollY + fieldRect.bottom + 5}px`;
    suggestion.style.left = `${window.scrollX + fieldRect.left}px`;

    // Add content
    suggestion.innerHTML = `
    <span style="margin-right: 10px;">Autofill 2FA code: <strong>${code}</strong></span>
    <button id="tfa-autofill-btn" style="background: #4285f4; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Autofill</button>
    <button id="tfa-dismiss-btn" style="background: transparent; border: none; color: #666; margin-left: 5px; cursor: pointer;">✕</button>
  `;

    // Add to page
    document.body.appendChild(suggestion);

    // Function to handle dismissal
    const handleDismiss = () => {
        suggestion.remove();
        if (typeof onDismiss === "function") {
            onDismiss();
        }
    };

    // Add event listeners
    document
        .getElementById("tfa-autofill-btn")
        .addEventListener("click", () => {
            field.value = code;
            field.dispatchEvent(new Event("input", { bubbles: true }));
            handleDismiss();
        });

    document
        .getElementById("tfa-dismiss-btn")
        .addEventListener("click", handleDismiss);

    // Auto-remove after 30 seconds
    setTimeout(() => {
        if (document.body.contains(suggestion)) {
            handleDismiss();
        }
    }, 30000);
}

// Show authentication prompt
function showAuthPrompt(field) {
    const authPrompt = document.createElement("div");
    authPrompt.className = "tfa-auth-prompt";
    authPrompt.style.cssText = `
    position: absolute;
    background: #f0f8ff;
    border: 1px solid #4285f4;
    border-radius: 4px;
    padding: 8px 12px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    z-index: 10000;
    font-family: Arial, sans-serif;
    font-size: 14px;
  `;

    // Position the prompt near the field
    const fieldRect = field.getBoundingClientRect();
    authPrompt.style.top = `${window.scrollY + fieldRect.bottom + 5}px`;
    authPrompt.style.left = `${window.scrollX + fieldRect.left}px`;

    // Add content
    authPrompt.innerHTML = `
    <p style="margin: 0 0 10px 0;">2FA Autofill needs access to your Gmail to find verification codes.</p>
    <button id="tfa-auth-btn" style="background: #4285f4; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Authenticate with Google</button>
    <button id="tfa-dismiss-auth-btn" style="background: transparent; border: none; color: #666; margin-left: 5px; cursor: pointer;">✕</button>
  `;

    // Add to page
    document.body.appendChild(authPrompt);

    // Add event listeners
    document.getElementById("tfa-auth-btn").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "authenticate" }, (response) => {
            authPrompt.remove();
            if (response.success) {
                // Try again after authentication
                setTimeout(detectTFAFields, 1000);
            }
        });
    });

    document
        .getElementById("tfa-dismiss-auth-btn")
        .addEventListener("click", () => {
            authPrompt.remove();
        });
}

// Run detection on page load
window.addEventListener("load", detectTFAFields);

// Set up a mutation observer to detect dynamically added fields
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
            detectTFAFields();
        }
    }
});

// Start observing
observer.observe(document.body, { childList: true, subtree: true });

// Also check periodically (some sites load content in unusual ways)
setInterval(detectTFAFields, 2000);
