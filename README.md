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

### Verifying tokens

When you set up Google Sign-In, successful sign-ins are redirected to your website, which receives a token.  But this could be faked.

How do you know a token is valid? 

One way to verify tokens is to get the profile of the current user.  

The Google Drive REST API `/about` is much shorter than the Google Plus Profile.  The reduced information is sufficient for populating simple apps and may be privacy-enhancing
compared with accessing public Google Plus profiles. Basically, Drive will tell you the user's email address, picture thumbnail, and the capacity and usage of their drive,
whereas with Google Plus you can everything someone reveals on their public Google Profile. While marketing often favors the latter, privacy favors the former.  

Here is code to fetch the logged in user's email address.  

	drive.x.aboutMe.then((info)=>(info.user.emailAddress)).then({...})
	
Once you have verified that a set of tokens work, you should encrypt them and store them someplace safe, where your app can get them when a user takes an action.
`access_token` expires, and usually has a time to live of 1 hour.  It is refreshed by `googleapis` using the `refresh_token`.

An obvious place is an encrypted browser cookie.  Of these, the `refresh_token` is only delivered once, the first time a user logs into google and approves your app,
and is *not delivered on subsequent logins*. If you encrypt it and store it in a database, then your database, along with the keys, becomes a treasure-trove.  You can 
avoid doing that by either throwing away the `refresh_token` and living with the 1 hour timeouts, or by storing an encrypted copy of the `refresh_token` in the users
Drive.  The `appDataFolder` is useful for this.  It is a special folder that is stored in the user's Drive for each app, and hidden from the user. The entire `appDataFolder`
is deleted when a user uninstalls or deletes your app. 

### Store a string in the appDataFolder 

Once initialized, this snippet will store a string in the file `myaccount` in the `appDataFolder`.

	const str = require('string-to-stream');
	const secrets = 'some-encrypted-string-of-secrets';

    drive.x.appDataFolder.upload2({ 
	   folderPath: '', 
	   name: 'myaccount', 
	   stream: str(secrets), 
	   mimeType: 'text/plain', 
	   createPath: false, 
	   clobber: true
	   }).then((newFileMetadata)=>{...}).catch((e)=>{...})
	   
upload2 uses a resumable upload.  

A [media upload](https://developers.google.com/drive/v3/web/manage-uploads) using `drive.files.create` directly from the unextended drive googleapi might be quicker for short files up to 5MB.

`drive.files.create` media upload requires having the `folder.Id` of the `parent` folder for the new file, here it is simply `appDataFolder`.  Also setting `spaces` to `appDataFolder` is required.

In `drive.x.appDataFolder.upload2` these steps are included but are used in a 2-step procedure to first request an upload URL, and then do an upload.


### upload a file to the user's Drive via resumable upload

To upload a local file, a stream is required, so call node's `fs.createReadStream('/path/to/local/files')`.

To create missing intermediate folders, set `createPath:true`, otherwise it may throw a `Boom.notFound`, which you can catch.

To replace an existing file, set `clobber:true`, otherwise it may throw a `Boom.conflict`, which you can catch.

    drive.x.upload2({
       folderPath: '/destination/path/on/drive',
       name: 'mydata.csv',
       stream: fs.createReadStream('/path/to/local/files/mydata.csv'),
       mimeType: 'text/csv',
       createPath: true,
       clobber: true
       }).then((newFileMetaData)=>{...}).catch((e)=>{...});
       
We haven't expereimented with disrupting the upload and trying to resume it.  It is done in one step and seems to deal
with 50 Mb zip files ok.

### getting a URL for resumable upload later

If you want to manage the resumable uploads, this creates a 0 byte file and retrieves a resumable upload URL for later use.  

These resumable upload URLs are good for quite a while and seem to be signed URL's that don't require tokens.  [See Drive API Docs:resumable-upload](https://developers.google.com/drive/v3/web/resumable-upload)

If you have `folderMetadata` from, say, `drive.x.findPath`, then you can create a URL-generating function for uploads with

    const getUploadUrlForFile = drive.x.uploadDirector(folderMetadata);
    
and then 

    getUploadUrlForFile({name: 'hello.txt', mimeType: 'text/plain'})
    
will resolve to some Google uploader URL that you can post to with `npm:request`

### Download a file knowing only the /path/to/file

You can find a file and download it one step with:

    drive.x.download('/path/to/myfile.zip', optional mimeType).then((zipdata)=>{...})

`mimeType` is only useful for Google Docs and Sheets that can be exported to various mimeTypes.
    
If the file does not exist, the promise will be rejected with Boom.notFound.

Internally, `drive.x.download` is a Promise chain with `drive.x.findPath` then `drive.x.contents`

### Download a file when you have the fileMetadata

Searching through the chain of folders involves multiple API calls and is slow when you already have the fileMetadata.

Instead get the `file.id` and use drive.x.contents:

     drive.x.contents(fileMetadata.id, optional mimeType).then((content)=>{...});
     
`mimeType` is only useful for Google Docs and Sheets that can be exported to various mimeTypes.

Internally, `drive.files.get` with the `media` download option is called.  If the file is a doc or sheet or presentation,
this will throw an error with the string `Use Export`.  `drive.x.contents` catches that error and calls `drive.files.export`
requesting the proper `mimeType`.  If you know you need to fetch a Google doc/sheet/presentation, it will be quicker to 
call `drive.files.export` directly.
	
### finding Paths with drive.x.findPath

As of Oct 2017, the Google Drive REST API and googleapis.drive nodeJS libraries do not let you directly search for `/work/projectA/2012/Oct/customers/JoeSmith.txt`.  

The search can be done, by either searching for any folder named JoeSmith and hoping there's no duplicates, or by searching the root folder for `/work` then searching `/work` for `projectA`
and continuing down the chain.  In the library I wrote functional wrappers on `googleapis.drive` so that `findPath` becomes a functional Promise `p-reduce` of an appropriate folder search
on an array of path components.  But you can simply call `drive.x.findPath` or `drive.x.appDataFolder.findPath` as follows:

    drive.x.findPath('/work/projectA/2012/Oct/customers/JoeSmith.txt').then((fileMetaData)=>{...})
	
where `{...}` is your code that needs `fileMetaData`.  The resolved data looks like this:

	{
	   id:  'dfakf20301241024klaflkafm', // Drive File Id
	   name: 'JoeSmith.txt',
	   mimeType: 'text/plain',
	   modifiedTime: 1507846447000, //  ms since Epoch
	   size: 21398 // size in Drive, may not equal number of bytes in file
	}

Additionally, `findPath` can fail with a rejected Promise.  `npm:boom` is used for errors our code throws.  You can also
get errors thrown by the googleapis code.

To catch file not found:

    .catch( (e)=>{  if (e.isBoom && e.typeof===Boom.notFound) return your_file_not_found_handler(e); throw e; } )

To catch two or more files with same name:

    .catch( (e)=>{  if (e.isBoom && e.typeof===Boom.expectationFailed) return your_duplicate_file_handler(e); throw e; })

### searching folders with drive.x.searcher

In all cases below, `...` should be replaced by your JavaScript code acting on the returned information.

To find all the files in the Drive that you can access, that are not in the trash:

    const findAll = drive.x.searcher({});
	findAll().then(({files})=>{...})
	
To find the files you can access that are in the trash:

	const findTrash = data.x.searcher({trashed: true});
	findTrash().then(({files})=>{...});
	
Notice that `drive.x.searcher` returns a `function`.  That function takes two parameters, a `parent` which is a folder file id and a `name`.

To find the top level files in the root of the Drive that you can access:

    const findAll = drive.x.searcher({});
	findAll('root').then(({files})=>{...});
	
To find zero, one or more files named `kittens.png` in the root of the Drive:

    findAll('root', 'kittens'png').then(({files})=>{...});
	
To find zero, one, or more trashed file named `severedhead.png` in any trashed folder in the Drive:

	const findTrash = data.x.searcher({trashed: true});
    findTrash(null, 'severedHead.png').then(({files})=>{...});
	
You can restrict mimeType or require a unique (single) file in the searcher parameters:

    const findTrashedPng = drive.x.searcher({trashed:true, mimeType: 'image/png', unique: true };
	( findTrashedPng(null, 'severedHead.png')
	    .then(drive.x.checkSearch)
		.then(({ files })=>{...})
		)
	
`unique:true` sets `limit:2` so is not in fact unique but instead returns 2 files quickly.  You can enforce uniqueness, thowing Boom errors, by calling
`drive.x.checkSearch` on the search results.  Successful searches are passed to the next `then()` and searches with missing files or duplicates
throw errors.  (see `drive.x.findPath` above for a descrption of these Boom errors and how to catch them).

The parent folder can be specified from a drive.x.findPath like this:

Finds the folder "/crime/sprees/murder" and looks for any files in this folder that are .png files, then calls imaginary functions
`notGuilty()` or `guilty()`.  Here `files` is an array so `files.length` is the number of files found.

    const findAll = drive.x.searcher({ mimeType: 'image/png' });
    ( drive.x.findPath('/crime/sprees/murder')
	    .then((folder)=>(findAll(folder.id)))
		.then( ({files})=>{ if (files.length===0) return notGuilty(); return guilty(); } )
		.catch( (e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return notGuilty(); throw e; })
		)
		
### delete the files you found

`drive.x.janitor` returns a function that calls something like `Promise.all(files.map(delete))`.  

The function returned by `drive.x.janitor` is intended to be placed in a `then` and picks out the data it needs and 
opionally sets a flag if the deletions are successful. The Janitor will not throw an error on an empty search, and
`drive.x.checkSearch` is not called in the upcoming snippet. However, irregardless, delete could throw an error on some file
and so a `.catch` is needed to catch the failed cases.  

This could delete all the accessible files with mimeType audio/mpeg

    const mp3search = drive.x.searcher({mimeType:'audio/mpeg'});
    const Jim = drive.x.janitor('files','deleted');
    mp3search().then(Jim).catch((e)=>{}); // we're trusting Jim the Janitor to clean up a lot here, he might hit an API limit
   	    
## Tests

I'm going to try to stay sane and not post a set of encrypted API keys and tokens to get a green "build passing" travis badge.

Instead, look in [testResults.txt](./testResults.txt), or set up your own testing.  

Current tests demonstrate some basic functionality. 

To confirm access tokens are being refreshed automatically, set up and run the tests once.  Wait until the access token
expires (usually an hour) and run the tests again.  

## License: MIT

Copyright 2017 Paul Brewer, Economic and Financial Technology Consulting LLC <drpaulbrewer@eaftc.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### No relationship to Google, Inc. 

This is third party software, not a product of Google Inc.

Google Drive[tm] is a trademark of Google, Inc.

