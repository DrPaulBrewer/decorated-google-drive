// Copyright 2017 Paul Brewer - Economic and Financial Technology Consulting LLC <drpaulbrewer@eaftc.com>
// License: MIT

// jshint esversion:6, strict:global, node:true

"use strict";

const pify = require('pify');
const pReduce = require('p-reduce');
const Boom = require('boom');
const digestStream = require('digest-stream');
const ssgd = require('search-string-for-google-drive');

const folderMimeType = 'application/vnd.google-apps.folder';

// googleapis = require('googleapis')
// request = require('request')

function decoratedGoogleDrive(googleapis, request, keys, tokens){
    if (!googleapis)
	throw new Error("googleapis not defined");
    if (!googleapis.auth)
	throw new Error("googleapis.auth not defined");
    if (!googleapis.auth.OAuth2)
	throw new Error("googleapis.auth.OAuth2 not defined");
    const OAuth2 = googleapis.auth.OAuth2;
    const auth = new OAuth2(keys.key, keys.secret, keys.redirect);
    // possible patch for googleapis 23.0.0 missing .setCredentials bug
    // see https://github.com/google/google-api-nodejs-client/issues/869
    // see https://github.com/google/google-auth-library-nodejs/issues/189
    if (typeof(auth.setCredentials)==='function'){
	auth.setCredentials(tokens);
    } else { 
	auth.credentials = tokens;
    }
    const drive = googleapis.drive({version: 'v3', auth});
    if (typeof(drive)!=='object')
	throw new Error("drive is not an object, got: "+typeof(drive));
    return decorate(drive, request);
}

function decorate(drive, request){
    // drive is delivered from googleapis frozen, so we'll refreeze after adding extensions
    const extras = {};
    extras.x = extensions(drive, request, 'root', 'drive');
    extras.x.appDataFolder = extensions(drive, request, 'appDataFolder', 'appDataFolder');
    return Object.freeze(Object.assign({}, drive, extras));
}

decoratedGoogleDrive.decorate = decorate;
module.exports = decoratedGoogleDrive;

function extensions(drive, request, rootFolderId, spaces){
    const x = {};

    function driveAboutMe(_fields){
	const fields = _fields || "user,storageQuota";
	return pify(drive.about.get)({fields});
    }

    x.aboutMe = driveAboutMe;

    function driveSearcher(options){
	var limit = ( options.limit || 1000 );
	const unique = options.unique;
	if (unique) limit = 2;
	const allowMatchAllFiles = options.allowMatchAllFiles;
	const fields = options.fields || 'id,name,mimeType,modifiedTime,size'; 
	const searchTerms = ssgd.extract(options);
	
	return function(parent, name){
	    const search = Object.assign({}, searchTerms, { parent, name });
	    const searchString = ssgd(search, allowMatchAllFiles); 
	    const params = {
		spaces,
		q: searchString,
		pageSize: limit,
		maxResults: limit,
		orderBy: "folder,name,modifiedTime desc",
		fields: `files(${fields})`
	    };

	    // see https://developers.google.com/drive/v3/web/search-parameters

	    return new Promise(function(resolve, reject){
		drive.files.list(params, function(err, resp){
		    if (err) return reject(err);
		    // add isFolder boolean property to files, comparing mimeType to the Google Drive folder mimeType
		    if ((resp.files) && (resp.files.length))
			for(var i=0,l=resp.files.length; i<l; ++i)
			    resp.files[i].isFolder =  (resp.files[i].mimeType===folderMimeType);
		    const result = { parent, name, searchTerms, limit, unique,  isSearchResult: true, files: resp.files };
		    return resolve(result);
		});
	    });
	};
    }

    x.searcher = driveSearcher;

    function checkSearch(searchResult){
	if (!Array.isArray(searchResult.files))
	    throw Boom.badRequest(null, searchResult);
	if (searchResult.files.length===0)
	    throw Boom.notFound("file not found", searchResult );
	if (searchResult.unique && (searchResult.files.length>1))
	    throw Boom.expectationFailed("expected unique file", searchResult );
	if (searchResult.files.length===searchResult.files.limit)
	    throw Boom.entityTooLarge('increase limit or too many files found', searchResult);
	searchResult.ok = true;
	return searchResult;
    }

    x.checkSearch = checkSearch;

    function driveJanitor(fileListProperty, successProperty){
	function deleteFile(file){
	    return pify(drive.files.delete)({fileId: file.id});
	}
	return function(info){
	    if (successProperty) info[successProperty] = false;
	    let files = (fileListProperty)? info[fileListProperty] : info;
	    if (files && files.id) files = [files];
	    if ((Array.isArray(files)) && (files.length>0))
		return (Promise
			.all(files.map(deleteFile))
			.then(()=>{ if (successProperty) info[successProperty] = true; return info; })
		       );
	    return Promise.resolve(info);
	};
    }

    x.janitor = driveJanitor;
    
    function getFolderId(folderIdOrObject){
	let parentId;
	if (typeof(folderIdOrObject)==='object'){
	    if (folderIdOrObject.id){
		if (folderIdOrObject.mimeType===folderMimeType)
		    return Promise.resolve(folderIdOrObject.id);
	    }
	}
	if (typeof(folderIdOrObject)==='string'){
	    return Promise.resolve(folderIdOrObject);
	}
	return Promise.reject(Boom.badRequest(null, {folder: folderIdOrObject}));
    }
	
    x.getFolderId = getFolderId;
    
    function driveStepRight(){
	const search = driveSearcher({unique: true});
	return function(folderIdOrObject, name){
	    return (getFolderId(folderIdOrObject)
		    .then((parentId)=>(search(parentId,name)))
		    .then(checkSearch)
		    .then((searchResult)=>(searchResult.files[0]))
		   );
	};
    }

    x.stepRight = driveStepRight;
    
    // see https://developers.google.com/drive/v3/web/folder

    function driveFolderCreator(){
	return function(f, name){
	    return (getFolderId(f)
		    .then((parentFolderId)=>{
			const mimeType = folderMimeType;
			const metadata = {
			    mimeType,
			    name,
			    parents: [parentFolderId]
			};
			return pify(drive.files.create)({
			    resource: metadata,
			    fields: 'id, mimeType, name'
			});
		    })
		   );
	};
    }

    x.folderCreator = driveFolderCreator;

    function driveFolderFactory(){
	const stepper = driveStepRight();
	const creator = driveFolderCreator();
	return function(f, name){
	    return (stepper(f,name)
		.catch((e)=>{
		    if ((e.isBoom) && (e.typeof===Boom.notFound)) return creator(f,name);
		    else return Promise.reject(e);
		})
		    );
	};
    }

    x.folderFactory = driveFolderFactory;
    
    function driveFindPath(path){
	const parts = path.split('/').filter((s)=>(s.length>0));
	const stepper = driveStepRight();
	return pReduce(parts, stepper, rootFolderId);
    }

    x.findPath = driveFindPath;

    function driveContents(fileId, mimeType){
	const getFile = pify(drive.files.get)({ fileId, spaces, alt: 'media' });
	if (!mimeType)
	    return getFile;
	return (getFile
		.catch( (e)=>{
		    if (e.toString().includes("Use Export"))
			return (pify(drive.files.export)({ fileId, spaces, mimeType }));
		    throw e;
		})
		    );
    }

    x.contents = driveContents;

    function driveDownload(path, mimeType){
	return driveFindPath(path).then((file)=>(driveContents(file.id, mimeType)));
    }

    x.download = driveDownload;

    function driveCreatePath(path){
	const parts = path.split('/').filter((s)=>(s.length>0));
	const dff = driveFolderFactory();
	return pReduce(parts, dff, rootFolderId);
    }

    x.createPath = driveCreatePath;

    function folderFrom(path){
	const parts = path.split('/').filter((s)=>(s.length>0));
	const len = parts.length;
	const pre = (path.startsWith('/'))? '/' : ''; 
	return pre+(parts.slice(0,len-1).join('/'));
    }

    x.folderFrom = folderFrom;

    function nameFrom(path){
	const parts = path.split('/').filter((s)=>(s.length>0));
	return parts[parts.length-1];
    }

    x.nameFrom =  nameFrom;

    // for url override see end of http://google.github.io/google-api-nodejs-client/22.2.0/index.html

    function driveUploadDirector(parentFolderOrId){
	return function(metadata){
	    return (
		getFolderId(parentFolderOrId)
		    .then((parent)=>{
			return new Promise(function(resolve, reject){
			    const meta = Object.assign({}, metadata, {parents: [parent], spaces});
			    const req = drive.files.create({
				resource: meta,
				fields: 'id,name,mimeType,md5Checksum'
			    },{
				url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"
			    });
			    req.on('response', (response)=>{
				const url = response.headers.location;
				resolve(url);
			    });
			    req.on('error', (e)=>(reject(e)));
			});
		    })
	    );
	};
    }

    x.uploadDirector = driveUploadDirector;

    function streamToUrl(localStream, mimeType){
	return function(url){
	    if ((typeof(url)==="string") && (url.startsWith("https://"))){
		const driveupload = {
		    method: 'POST',
		    uri: url,
		    headers: {
			'Content-Type': mimeType
		    }
		};
		return new Promise(function(resolve,reject){
		    let md5,length;
		    const md5buddy = digestStream('md5','hex', function(_md5, _length){
			md5 = _md5 ;
			length = _length;
		    });  
		    const uploadRequest = request(driveupload, (err, httpIncomingMessage, response)=>{
			if (err) return reject(err);
			let result;
			if (typeof(response)==='string'){
			    try {
				result = JSON.parse(response);
			    } catch(err){ result = response; }
			} else {
			    result = response;
			}
			if ((!mimeType) || (!mimeType.startsWith('text'))){
			    // check md5 only on binary data, and only if reported back by Google Drive API
			    if ((result && result.md5Checksum)){
				result.ourMD5 = md5; // set ours here too
				if (md5 !== result.md5Checksum){
				    reject(Boom.badImplementation('bad md5 checksum on upload to Google Drive', result));
				}
			    }			    
			}
			resolve(result);
		    });
		    localStream.pipe(md5buddy).pipe(uploadRequest);
		});
	    }
	    return Promise.reject("drive.x.streamToUrl: not a valid https url");
	};
    }

    x.streamToUrl = streamToUrl;

    function upload2({folderPath, folderId, name, stream, mimeType, createPath, clobber}){
	function requireString(v, l, k){
	    if ((typeof(v)!=='string') || (v.length<l))
		throw new Error("drive.x.upload2, invalid parameter "+k+", requires string of length at least "+l+" chars");
	}
	requireString(name,1,'name');
	requireString(mimeType,1,'mimeType');
	if (folderPath && folderId) throw new Boom.badRequest("bad request, specify folderPath or folderId, not both");
	const findAll = driveSearcher({}); 
	const getFolder = (createPath)? (driveCreatePath(folderPath)) : ( (folderId && Promise.resolve(folderId)) || driveFindPath(folderPath));
	function go({parent}){
	    if (parent===undefined) throw Boom.badImplementation("parent undefined");
	    const pUploadUrl = driveUploadDirector(parent);
	    return (
		pUploadUrl({name, mimeType})
		    .then(streamToUrl(stream, mimeType))
			);
	}

	const common = (getFolder
			.then(getFolderId)
			.then((parent)=>(findAll(parent,name)))
		       );

	if (clobber){
	    const janitor = driveJanitor('files');
	    return (common
		    .then(janitor)
		    .then(go)
		   );		
	}
	
	return (common
		.then(({parent, files})=>{
		    if (files.length>0)
			throw Boom.conflict('file exists');
		    return go({parent});
		})
	       );
    }
    

    x.upload2 = upload2;

    return x;
}
