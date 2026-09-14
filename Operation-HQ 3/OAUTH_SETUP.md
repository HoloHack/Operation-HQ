# Operation HQ — Gmail OAuth setup

Operation HQ uses Chrome's official identity API and Gmail's read-only API. No client secret belongs in this extension.

## Values locked into release 2.0

- Chrome extension / Google Console Item ID: `cbgepkbfmcahdpahipkdeahppfbggjok`
- OAuth Client ID: `909480994423-tv8bkcfd8v8il907lph0t2b72oh165k6.apps.googleusercontent.com`
- OAuth scope: `https://www.googleapis.com/auth/gmail.readonly`

The public manifest key keeps the unpacked extension ID stable when the folder moves. Do not delete or replace that key unless you deliberately create a new Google OAuth client for the resulting extension ID.

## Google Console verification checklist

1. In project `hq-newtab`, confirm the Gmail API is enabled.
2. If the app remains in Testing, confirm `shourya.education2023@gmail.com` is still listed under Google Auth Platform → Audience → **Test users**. The owner reports this has now been completed.
3. Open the Chrome Extension OAuth client and confirm its Item ID is exactly `cbgepkbfmcahdpahipkdeahppfbggjok`.
4. If the saved client was created with another Item ID, create a replacement **Chrome Extension** client with the correct Item ID and replace `oauth2.client_id` in `manifest.json` with that new public Client ID.
5. Reload Operation HQ from `chrome://extensions`, open a new tab, open Gmail, and choose **Connect Gmail**.

Chrome Extension clients do not need a redirect URL or a client secret for `chrome.identity.getAuthToken`. Operation HQ requests inbox metadata only and opens selected threads in Gmail itself.

## If sign-in still fails

- `bad client id`: the OAuth client is not tied to the exact Item ID above.
- `access blocked` or test-user error: add the connecting Google account under Audience → Test users.
- API disabled: enable Gmail API in the same Google Cloud project as the OAuth client.
- A revoked session: use Disconnect in Operation HQ, reload the extension, then connect again.
- Copy Settings → System Health diagnostics if the UI only reports a generic failure. Saved diagnostics redact credential-like values.
