# decorated-google-drive

Initialize googleapi's Google Drive[tm] client, decorated with some useful 3rd party extensions.

## Summary

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
    
	// now drive   contains googleapis.drive official library functions, mostly callback based
	// and drive.x contains 3rd party extension methods that return Promises
	
	// what follows is a kind of meta-coding.  For example mimeType:string is not valid JavaScript, but simply tells you mimeType should be a string.
	// similarly {...} is also not valid JavaScript but is a placeholder for your code.
	// drive.x.method(param1)(param2) means that drive.x.method(param1) returns a function(param2) 
	
	drive.x.aboutMe.then((info)=>{...});
	// resolves to info.user and info.storageQuota
	// see https://developers.google.com/drive/v3/reference/about#resource
	
	drive.x.fileFinder(mimeType:string, findAll:boolean)(parent:FolderObject|FolderIdString, name:String).then((info)=>{...}).catch((e)=>{ if (e===404) {...}; })
	// finds a file's metadata by name and parent, and optionally by mimeType.  reolves to all such files metadata if findAll is true.
	// throws the number 404 if no files are found
	// resolves to an object containing file metadata: id, name, mimeType, modifiedTime, size
	
	drive.x.janitor(returnVal)(file:Object).then((info)=>{...});
	// deletes the file (permanently, not trash) referenced by file.id 
	// resolves to returnVal
	
	drive.x.getFolderId(folderIdOrObject).then((info)=>{...});
	// if folderIdOrObject is file metadata for a folder, it resolves to the file.id of the folder
	// if folderIdOrObject is file metadata for a non-folder file, it rejects with an error
	// if folderIdOrObject is a string, it resolves to the string
	
	drive.x.stepRight()(folderIdOrObject, name).then((info)=>{...});
	// a version of drive.x.fileFinder with fewer options; used with p-reduce to make drive.x.findPath
	
	drive.x.driveFolderCreator()(parentFolderIdOrObject, name).then((info)=>{...});
	// NOTE: see below, you probably want drive.x.folderFactory or drive.x.createPath instead 
	// creates a new folder with name inside the parent
	// issue: be careful. does not currently de-duplicate (Google Drive allows multiple files and folders with the same name)
	// resolves to file metadata id, mimeType for the folder

	drive.x.folderFactory()(parentFolderIdOrObject, name).then((info)=>{...});
	// creates folders only if they do not exist
	// resolves to the metadata of the folder in parent irregardless of pre-existing/new status
	
	drive.x.findPath(rootFolderId, path).then((info)=>{...})
	// rootFolderId should be 'root' (normal Drive files) or 'appDataFolder' (secret Drive files private to your app)
	// path looks like a filesystem path.  (Hooray!)  e.g. '/saved/Oct-01-2017-3pm/data.csv'
	// resolves to an object containing file metadata: id, name, mimeType, modifiedTime, size
	// no such file rejects with e===404
	
	drive.x.reader(spaces)(fileId).then((contents)=>{...})
	// note: you probably want drive.x.downloader instead
	// spaces:string, required, is either 'drive' or 'appDataFolder'
	// file reader/downloader, requires fileId = file.id from file metadata
	// resolves to file contents
	// can reject 404 if no such file
	
	drive.x.downloader(rootFolderId)(path).then((contents)=>{...})
	// rootFolderId:string, required, should be 'root' or 'appDataFolder'
	// path is a path-like string, e.g. '/saved/Oct-02-2017-3pm/data.csv'
	// resolves to file contents
	// can reject 404 if no such file
	
	drive.x.createPath(rootFolderId, path).then((info)=>{...})
	// rootFolderId:string, required, should be 'root' or 'appDataFolder'
	// path is a path-like string, e.g. '/saved/Oct-02-2017-3pm' or '/saved/Oct-02-2017-3pm/' (equivalent)
	// creates folder described at path, creating intermediate folders as necessary
	// resolves to metadata for new folder or pre-existing folder with same path
	
	drive.x.folderFrom(path)
	// convenience function, returns the /path/to portion of /path/to/file.ext
	
	drive.x.nameFrom(path)
	// convenience function, returns the "file.ext" portion of /path/to/file.ext
	
	drive.x.uploadDirector(parentFolderOrId)(metadata).then((uploadURL)=>{...})
	// Note: You probably want drive.x.upload2 instead, see below
	// asks Google Drive for an upload URL using the resumable upload API
	// does NOT check for existence or de-duplicate
	
	drive.x.streamToUrl(localStream, mimeType)(URL)
	// companion function to drive.x.uploadDirector
	// Note: You probably still want drive.x.upload2 instead. See below.
	
	drive.x.checkDuplicates(files)
	// function to check that the input array files only contains 1 file or throw errors
	// throws 404 
	// theows "checkDuplicates: failed, multiple files with same name
	
	drive.x.upload2({ rootFolderId, folderPath, name, stream, mimeType, createPath, clobber}).then((info)=>{...})
	// performs upload of local content from stream to new file in Google Drive
	// rootFolderId:string, required, should be 'root' or 'appDataFolder'
	// folderPath, a path-like string, e.g. "/path/to/saved-files/"
	// name, the filename without the path, e.g. "lotsofdata.csv"
	// stream, a readable stream for the contents to upload, perhaps from fs.createReadStream or string-to-stream
	// mimeType, a mimeType like "text/csv" or "application/zip"
	// createPath, boolean, optional, if true then create missing folders as necessary; otherwise will throw 404 on non-existent path
	// clobber, boolean, must be true to replace an existing file, in which case all files matching folderPath+name will be deleted.
	// clobber = false/undefined will reject when the file exists with Error("drive.x.upload2: file exists and clobber not set")
	// on success, resolves to metadata of newly uploaded file
	

## License: MIT

Copyright 2017 Paul Brewer, Economic and Financial Technology Consulting LLC <drpaulbrewer@eaftc.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### No relationship to Google, Inc. 

This is third party software, not a product of Google Inc.

Google Drive[tm] is a trademark of Google, Inc.

