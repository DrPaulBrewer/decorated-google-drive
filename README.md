# decorated-google-drive

Initialize googleapi's Google Drive[tm] nodejs client, decorated with some useful 3rd party extensions.

## new in v6.0.0 -- BREAKING CHANGES
* initialization has changed
* provided methods and testing is (mostly) the same
* initialization uses object parameters
* replaced `request` peer dependency with `axios`
* tested against googleapis@58.0.0

## new in v5.4.0
* path traversal now uses search option 'recent' and will find the most recent file
* it is better behaved in the case of multiple files with the same name
* issues can arise if a user creates a file with the same name as an existing app folder

## new in v5.3.0
* tested against googleapis@47.0.0

## new in v5.0.0
* `drive.x.auth` contains a reference to the OAuth2 credentials object.  For insecure applications, this should be deleted with `del drive.x.auth;`.

## new in v4.3.1
* tested against googleapis@36.0.0

## new in v4.3
* the `drive.x.hexid()` formula was changed.  The new  `crypto.createHmac` formula is more secure, and effectively case insensitive
as `.toLowerCase().trim()` is called on email strings before processing.  But it does yield different hex values than v4.2.
* the internal formula is now available as `drive.x.hexIdFromEmail(email,secret)` and does not call any Google drive functions

## new in v4.2
* `drive.x.hexid()` returns a Promise resolving to a consistent 64 char hex id that is an anonymous pseudonym of the drive owner's email address.
* you can enable `drive.x.hexid` by setting any string as the salt for the hexid sha256 hash when `driveX` is called to initialize.

## new in v4.0

* (hopefully) now compatible with googleapis@30.0.0
* Initialization has changed slightly, because googleapis@30.0.0 uses named exports
* Now promise/async compatible at both clasic `drive` and extensions `drive.x`
* mostly the same API as v3, minimal changes.  Still uses `request` for resumable upload.  Will move to axios for `v5`.
   * The `drive` functionality is vanilla GoogleApis and from their changes you may need to `.then((resp)=>(resp.data))`
   * The `drive.x` functionality is mostly the same, except  promise-yielding functions are now explicitly marked as async function


## Usage

### Install

Pre-requisites are `googleapis@58.0.0` and `axios`


    npm i googleapis@58.0.0 -S
    npm i axios -S
    npm i decorated-google-drive -S

### Initialize

Updated for v6.0

Pass the google object from initializing googleapis and pass the axios module, your keys and tokens. The `keys` are obtained from the Google API credentials console.

The `tokens` are obtained when a user "Logs in with Google" in your app.  There is various middleware for "Log in with Google", such as
`passport` for `express`, `grant` and `bell` for `hapi`, and even a client-Javascript side library you can get from Google.  

    const {google} = require('googleapis'); // works with googleapis-58.0.0
    const axios = require('axios'); // worked with axios-0.19.2
    const driveX = require('decorated-google-drive');
    const salt = "100% Organic Sea Salt, or some other string for salting the email addresses when making hexids";
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
	  const drive = driveX({google, axios, keys, tokens, salt});

Now:
* `drive` contains a googleapis.drive official client
* `drive.x` contains 3rd part extension methods for accessing Google Drive, providing path resolution, search, testing search result existence/uniqueness, and resumable upload.
* `drive.x.appDataFolder` contains the same extension methods as `drive.x`, but set up to access the hidden appDataFolder

All extensions are written in terms of calls to `googleapis.drive`, it is simply that some of the techniques are tedious or less than obvious,
and so it is useful to repackage these as extensions.

Both the original drive client in `drive` and the `drive.x` extensions are async functions and return Promises.

### Decorate an existing vanilla googleapis.drive instance

This should work in cases where `drive` already exists and has credentials.

	 const axios = require('axios');
	 const driveX = require('decorated-google-drive');
   const salt = 'saltIsGoodForYourHexids';
	 const ddrive = driveX.decorate({drive, axios, salt});

Now the extensions are available in `ddrive.x` and `ddrive.x.appDataFolder`

### Verifying tokens

When you set up Google Sign-In, successful sign-ins are redirected to your website, which receives a token.  But this could be faked.

How do you know a token is valid?

One way to verify tokens is to get the profile of the current user.  

The Google Drive REST API `/about` will tell you the user's email address, picture thumbnail, and the capacity and usage of their drive.

Here is code to fetch the logged in user's email address.  

	drive.x.aboutMe().then((info)=>(info.user.emailAddress)).then({...})

Once you have verified that a set of tokens work, you should encrypt them and store them someplace safe, where your app can get them when a user takes an action.
`access_token` expires, and usually has a time to live of 1 hour.  It is refreshed by `googleapis` using the `refresh_token`.

An obvious place is an encrypted browser cookie.  Of these, the `refresh_token` is only delivered once, the first time a user logs into google and approves your app, and is *not delivered on subsequent logins*. If you encrypt it and store it in a database, then your database, along with the keys, becomes a treasure-trove.  You can
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

A [media upload](https://developers.google.com/drive/v3/web/manage-uploads) using `drive.files.create` directly from the unextended drive googleapi might be quicker for short files up to a few MB.

`drive.files.create` media upload (not shown above) requires having the `folder.Id` of the `parent` folder for the new file, here it is simply `appDataFolder`.  Also setting `spaces` to `appDataFolder` is required.

In `drive.x.appDataFolder.upload2` (shown here) these steps are included. Internally, they are used in a 2-step procedure
to first request an upload URL, and then do an upload.  This 2-step procedure is invisible to the developer,
but can be seen in the source code.


### upload a file to the user's Drive via resumable upload

To upload a local file, a stream is required, so call node's `fs.createReadStream('/path/to/local/files')`.

To create missing intermediate folders, set `createPath:true`, otherwise it may throw a `Boom.notFound`, which you can catch.

To replace an existing file, set `clobber:true`, otherwise it may throw a `Boom.conflict`, which you can catch.

Post-upload checksums reported by Google Drive API are used to guarantee fidelity for **binary** file uploads.

A binary file
is any non-text file.  The md5 checksum computed from the file stream is reported as `ourMD5` in the `newFileMetaData`
and the md5 checksum computed by Google is reported as `md5Checksum` in the `newFileMetaData`.  When there is a mismatch
on a binary file the code will throw `Boom.badImplementation`, which you can catch, and any recovery should check if Google
Drive retains the corrupted upload.


    drive.x.upload2({
       folderPath: '/destination/path/on/drive',
       name: 'mydata.csv',
       stream: fs.createReadStream('/path/to/local/files/mydata.csv'),
       mimeType: 'text/csv',
       createPath: true,
       clobber: true
       }).then((newFileMetaData)=>{...}).catch((e)=>{...});

We haven't tried disrupting the upload and then trying to resume it.  

It seems to deal with 5GB binary .zip files ok.

As of `decorated-google-drive:2.1.0` It is also possible to set `folderId` to a Drive `folder.id` string instead of setting `folderPath` to a path string.

### getting a URL for resumable upload later

If you want to manage the resumable uploads, this creates a 0 byte file and retrieves a resumable upload URL for later use.  

These resumable upload URLs are good for quite a while and seem to be signed URL's that don't require tokens.  [See Drive API Docs:resumable-upload](https://developers.google.com/drive/v3/web/resumable-upload)

If you have `folderMetadata` from, say, `drive.x.findPath`, then you can create a URL-generating function for uploads with

    const getUploadUrlForFile = drive.x.uploadDirector(folderMetadata);

and then

    getUploadUrlForFile({name: 'hello.txt', mimeType: 'text/plain'})

will resolve to some Google uploader URL that you can post to with `npm:axios`

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

As of Oct 2017, the Google Drive REST API and googleapis.drive nodeJS libraries do not let you directly search for `/work/projectA/2012/Oct/customers/JoeSmith.txt`.  Therefore we provide an extension to do this search.

The search can be done, by either searching for any file named JoeSmith.txt and possibly looking at duplicates, or by searching the root folder for `/work` then searching `/work` for `projectA`
and continuing down the chain.  In the library, I wrote functional wrappers on `googleapis.drive` so that `findPath` becomes a functional Promise `p-reduce` of an appropriate folder search
on an array of path components. Now you can simply search for a path by a simple call to `drive.x.findPath` or `drive.x.appDataFolder.findPath` as follows:

    drive.x.findPath('/work/projectA/2012/Oct/customers/JoeSmith.txt').then((fileMetaData)=>{...})

where `{...}` is your code that needs `fileMetaData`.  The resolved data looks like this:

	{
	   id:  'dfakf20301241024klaflkafm', // Drive File Id
	   name: 'JoeSmith.txt',
	   mimeType: 'text/plain',
	   modifiedTime: 1507846447000, //  ms since Epoch
	   size: 21398 // size in Drive, may not equal number of bytes in file
	}

Additionally, `findPath` can fail with a rejected Promise.  
`npm:boom` is used for errors our code throws.  
You can also get errors thrown by the googleapis code.

To catch file not found:

    .catch( (e)=>{  if (e.isBoom && e.typeof===Boom.notFound) return your_file_not_found_handler(e); throw e; } )


### searching folders with drive.x.searcher

In all cases below, `...` should be replaced by your JavaScript code acting on the returned information.

To find all the files in the Drive that you can access, that are not in the trash:

    const findAll = drive.x.searcher({}); // or { trashed: false }
	findAll().then(({files})=>{...});

Here `files` is an array of objects with properties `.id`, `.name`, `.parents`, `.mimeType` and at least the properties you were searching over.

To find the files you can access that are in the trash:

	const findTrash = data.x.searcher({trashed: true});
	findTrash().then(({files})=>{...});

Note that as of 3.0.0 there is no way to return all the files independent of trash status.

You can set which fields are returned by setting `fields` explicitly like this `drive.x.searcher({fields: 'id,name,mimeType,md5Checksum'})`

Notice that `drive.x.searcher` returns a `function`.  That function takes two parameters, a `parent` which is a folder file id and a `name`.

To find the top level files in the root of the Drive that you can access:

    const findAll = drive.x.searcher({});
	findAll('root').then(({files})=>{...});

To find zero, one or more files named `kittens.png` in the root of the Drive:

    findAll('root', 'kittens'png').then(({files})=>{...});

To find zero, one, or more trashed file named `severedhead.png` in the Drive:

	const findTrash = data.x.searcher({trashed: true});
    findTrash(null, 'severedHead.png').then(({files})=>{...});

You can restrict mimeType or require a unique (single) file in the searcher parameters:

    const findTrashedPng = drive.x.searcher({trashed:true, mimeType: 'image/png', unique: true };
	( findTrashedPng(null, 'severedHead.png')
	    .then(drive.x.checkSearch)
		.then(({ files })=>{...})
		)

`recent:true` sets `limit:1` and `orderby:'modifiedTime desc'` so that the most
recently created/modified file will be returned.

`unique:true` sets `limit:2` so is not in fact unique but instead returns 2 files quickly.  

You can enforce uniqueness, thowing Boom errors, by calling
`drive.x.checkSearch` on the search results.  Successful searches are passed to the next `then()` and searches with missing files or duplicates
throw errors.  (see `drive.x.findPath` above for a descrption of these Boom errors and how to catch them).

`drive.x.searcher` tests all returned files/folders  mimeTypes against the Google Drive Folder mimeType 'application/vnd.google-apps.folder' and sets
`.isFolder` to `true` or `false` for each file/folder in `files` appropriately.

You can also use `isFolder:true` or `isFolder:false` as a search term to limit what is returned.  If `isFolder` is unspecified, a search can return a mix of files and folders.

The parent folder can be specified from an earlier promise, such as `drive.x.findPath` like this:

Finds the folder "/crime/sprees/murder" and looks for any files in this folder that are .png files, then calls imaginary functions
`notGuilty()` or `guilty()`.  Here `files` is an array so `files.length` is the number of files found.

    const findAll = drive.x.searcher({ mimeType: 'image/png' });
    ( drive.x.findPath('/crime/sprees/murder')
	    .then((folder)=>(findAll(folder.id)))
		.then( ({files})=>{ if (files.length===0) return notGuilty(); return guilty(); } )
		.catch( (e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return notGuilty(); throw e; })
		)

### update file metadata

`drive.x.updateMetadata(fileId, metadata)` is a Promise-based alias for `drive.files.update({fileId, resource:metadata})`

`drive.x.updateMetadata(fileId, {properties: {role: 'instructions'}, description: 'read this first'})` would set public file properties to `{role: 'instructions'}` and
set the file's `description` field to "read this first".

The Promise resolves to the new file object, with properties `.id`,`.name`,`.mimeType`,`.parents`, and at least any fields set in metadata.

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

## Additional properties in resolved file objects

`.isNew` is always set to `true` by `drive.x.upload2` and `drive.x.folderCreator`  always and set to `true` conditionally by `drive.x.createPath`, `drive.x.folderFactory` if a new folder is created, and is not set (undefined/falsey)  when the requested folder already exists.

`.isFolder` is set to `true` on searches and folder creation when mimeType in the returned metadata indicates the Google Drive folder mimeType.

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
