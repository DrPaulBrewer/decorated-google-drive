To run the tests

1. collect required information

* a Google Drive API `client_id` and `client_secret`
* a `refresh_token` and `access_token` 

You can use [curl](https://stackoverflow.com/a/18260206/103081) and a browser to get the refresh and access tokens for testing.

The tests use these OAuth2 scopes

* `"https://www.googleapis.com/auth/drive"` Create files and read files made by the app.
* `"https://www.googleapis.com/auth/drive.appfolder"` Use the hidden appDataFolder.

1. set these environment variables

* `GOOGLE_DRIVE_CLIENT_ID`
* `GOOGLE_DRIVE_SECRET`
* `GOOGLE_DRIVE_REDIRECT="urn:ietf:wg:oauth:2.0:oob"`
* `GOOGLE_DRIVE_ACCESS_TOKEN`
* `GOOGLE_DRIVE_REFRESH_TOKEN`
* `GOOGLE_DRIVE_EXPIRY_DATE`

then run `npm test`

Note: In production, your web app will obtain the refresh token the first time your visitor logs into Google Drive and enables the app, and will receive
access_tokens every time your visitor logs in with Google Drive.

