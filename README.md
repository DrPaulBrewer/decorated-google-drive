# decorated-google-drive

Initialize googleapi's Google Drive[tm] client, decorated with some useful 3rd party extensions.

## Usage

### Initialize

Pass the googleapis and request modules, and your keys and tokens. The `keys` are obtained from the Google API credentials console.

The `tokens` are obtained when a user "Logs in with Google" in your app.  There is various middleware for "Log in with Google", such as
`passport` for `express`, `grant` and `bell` for `hapi`, and even a client-Javascript side library you can get from Google.  

    const googleapis = require('googleapis'); // worked with googleapis-22.20
	const request = require('request'); // worked with request-2.83.0
	const driveX = require('decorated-google-drive');
	const keys = {
		key:  "your-drive-api-key-goes-here",
		secret: "your-drive-api-secret-goes-here",
		redirect: "https://yourhost.com/your/apps/google/redirect/url"
	};
	// refresh_token is optional, but if present googleapis should automatically refresh access_token for you
	const tokens = {
		refresh_token: "the-refresh-token-your-app-received-the-first-time-a-new-visitor-approved-your-app",
	    access_token: "the-latest-access-token-your-app-received-the-most-recent-time-the-visitor-logged-in,
		expiry_time: Date.now()+1000*60*59 // 59 minutes
    };
	const drive = driveX(googleapis, request, keys, tokens); 

Now:
* `drive` contains a googleapis.drive official client
* `drive.x` contains 3rd part extension methods for accessing Google Drive, providing path resolution, search, testing search result existence/uniqueness, and resumable upload.
* `drive.x.appDataFolder` contains the same extension methods as `drive.x`, but set up to access the hidden appDataFolder

All extensions are written in terms of calls to `googleapis.drive`, it is simply that some of the techniques are tedious or less than obvious,
and so it is useful to repackage these as extensions.

The original drive client uses callbacks.  The `drive.x` extensions return Promises.

### Verify tokens

One way to verify tokens is to get the profile of the current user.  

The Google Drive REST API `/about` is much shorter than the Google Plus Profile.  The reduced information is sufficient and may be privacy-enhancing
compared with public Google Plus profiles. Here is code to fetch the logged in user's email address.  

	drive.x.aboutMe.then((info)=>(info.user.emailAddress)).then({...})
	
Once you have verified that a set of tokens work, you should encrypt them and store them someplace safe, where your app can get them when a user takes an action.
`access_token` expires, and usually has a time to live of 1 hour.  It is refreshed by `googleapis` using the `refresh_token`.

An obvious place is an encrypted browser cookie.  Of these, the `refresh_token` is only delivered once, the first time a user logs into google and approves your app,
and is *not delivered on subsequent logins*. If you encrypt it and store it in a database, then your database, along with the keys, becomes a treasure-trove.  You can 
avoid doing that by either throwing away the `refresh_token` and living with the 1 hour timeouts, or by storing an encrypted copy of the `refresh_token` in the users
Drive.  The `appDataFolder` is useful for this.  It is a special folder that is stored in the user's Drive for each app, and hidden from the user. The entire `appDataFolder`
is deleted when a user uninstalls or deletes your app. 

### Store a string in the appDataFolder 

Once initialized, this snippet will store a string in the file `myaccount` in the `appDataFolder`
    
	const str = require('string-to-stream');
	const secrets = 'some-encrypted-string-of-secrets';

    drive.x.appDataFolder.upload2({ 
	   folderPath: '', 
	   name: 'myaccount', 
	   stream: str(secrets), 
	   mimeType: 'text/plain', 
	   createPath: false, 
	   clobber: true
	   }).then((info)=>{...}).catch((e)=>{...})

    // performs upload of local content from stream to new file in Google Drive
	// folderPath, a path-like string, e.g. "/path/to/saved-files/"
	// name, the filename without the path, e.g. "lotsofdata.csv"
	// stream, a readable stream for the contents to upload, perhaps from fs.createReadStream or string-to-stream
	// mimeType, a mimeType like "text/csv" or "application/zip"
	// createPath, boolean, optional, if true then create missing folders as necessary; otherwise will throw 404 on non-existent path
	// clobber, boolean, must be true to replace an existing file, in which case all files matching folderPath+name will be deleted.
	// clobber = false/undefined will reject when the file exists with Error("drive.x.upload2: file exists and clobber not set")
	// on success, resolves to metadata of newly uploaded file
	
### Missing Docs 

drive.x.{findPath, searcher, download, ...}

Read the source. 
	    
## Tests

I'm going to try to stay sane and not post a set of encrypted API keys and tokens to get a green "build passing" travis badge.

Instead, look in [testResults.txt](./testResults.txt), or set up your own testing.  

Current demonstrate some basic functionality. From using this over a period of hours, access tokens are being refreshed automatically.

## License: MIT

Copyright 2017 Paul Brewer, Economic and Financial Technology Consulting LLC <drpaulbrewer@eaftc.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### No relationship to Google, Inc. 

This is third party software, not a product of Google Inc.

Google Drive[tm] is a trademark of Google, Inc.

