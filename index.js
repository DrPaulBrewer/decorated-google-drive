// jshint esversion:6, strict:global, node:true

"use strict";

const pify = require('pify');
const pReduce = require('p-reduce');

const folderMimeType = 'application/vnd.google-apps.folder';

// googleapis = require('googleapis')
// request = require('request')

module.exports = function(googleapis, request, keys, tokens){
    const OAuth2 = googleapis.auth.OAuth2;
    const auth = new OAuth2(keys.key, keys.secret, keys.redirect);
    auth.setCredentials(tokens);
    const drive = googleapis.drive({version: 'v3', auth});
    // drive is delivered from googleapis frozen, so we'll refreeze after adding extensions
    return Object.freeze(Object.assign({}, drive, {x: extensions(drive, request)}));
};

function extensions(drive, request){
    const x = {};
	
    function driveAboutMe(_fields){
	const fields = _fields || "user,storageQuota";
	return pify(drive.about.get)({fields});
    }

    x.aboutMe = driveAboutMe;

    function driveFileFinder(mimeType, findAll){
	function escape(s){
	    return "'"+String(s).replace(/'/g, "\\'")+"'";	
	}
	return function(parent, name){

	    // Drive API: files
	    //   maxResults 1
	    //   spaces 'drive'
	    // look in resp[1].items[0].id
	    // search string trashed = false name = name and mimeType = mimeType and parent in parents

	    const search = ["trashed=false"];
	    if (name) search.push("name="+escape(name));
	    if (parent) search.push(escape(parent)+" in parents");
	    if (mimeType) search.push("mimeType="+escape(mimeType));
	    const searchString = search.join(" and ");
	    const params = {
		spaces: ((parent === 'appDataFolder')? parent : 'drive'),
		q: searchString,
		pageSize: 1000,
		orderBy: "folder,name,modifiedTime desc",
		fields: "files(id,name,mimeType,modifiedTime,size)"
	    };

	    if (!findAll) params.maxResults = 1;
	    
	    // see https://developers.google.com/drive/v3/web/search-parameters

	    return new Promise(function(resolve, reject){
		drive.files.list(params, function(err, resp){
		    if (err) return reject(err);
		    if ((resp.files) && ((resp.files.length)>0)){
			const result = (findAll)? resp.files: resp.files[0];
			return resolve(result);
		    }
		    reject(404);
		});
	    });
	};
    }

    x.fileFinder = driveFileFinder;

    function driveJanitor(returnVal){
	function deleteFile(file){
	    return pify(drive.files.delete)({fileId: file.id});
	}
	return function(files){
	    if (Array.isArray(files))
		return (Promise
			.all(files.map(deleteFile))
			.then(()=>(returnVal))
		       );
	    else
		return Promise.resolve();
	};
    }

    x.janitor = driveJanitor;
    
    function getFolderId(folderIdOrObject){
	let parentId;
	if (typeof(folderIdOrObject)==='object'){
	    if (folderIdOrObject.id){
		if (folderIdOrObject.mimeType===folderMimeType)
		    return Promise.resolve(folderIdOrObject.id);
		else
		    return Promise.reject("getFolderId: folderIdOrObject is not a folder: unexpected mimeType "+folderIdOrObject.mimeType);
	    }
	} else if (typeof(folderIdOrObject)==='string'){
	    return Promise.resolve(folderIdOrObject);
	}
	return Promise.reject(new Error("getFolderId: folderIdOrObject must be a string containing the folder id or an object representing a Google Drive folder"));
    }

    x.getFolderId = getFolderId;
    
    function driveStepRight(){
	const finder = driveFileFinder();
	return function(folderIdOrObject, name){
	    return (getFolderId(folderIdOrObject)
		    .then((parentId)=>(finder(parentId,name)))
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
			    fields: 'id, mimeType'
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
		    if (e===404) return creator(f,name);
		    else return Promise.reject(e);
		})
		    );
	};
    }

    x.folderFactory = driveFolderFactory;
    
    function driveFindPath( rootFolderId, path){
	const parts = path.split('/').filter((s)=>(s.length>0));
	const stepper = driveStepRight();
	return pReduce(parts, stepper, rootFolderId);
    }

    x.findPath = driveFindPath;

    function driveReader( spaces){
	return function(fileId){
	    return pify(drive.files.get)({ fileId, spaces, alt: 'media' });
	};
    }

    x.reader = driveReader;

    function driveDownloader( rootFolderId){
	const spaces = (rootFolderId === 'appDataFolder')? rootFolderId : 'drive';
	const reader = driveReader( spaces);
	return function(path){
	    return (
		driveFindPath( rootFolderId, path)
		    .then((file)=>(reader(file.id)))
	    );
	};
    }

    x.downloader = driveDownloader;

    function driveCreatePath( rootFolderId, path){
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

    function driveUploadDirector( parentFolderOrId){
	return function(metadata){
	    if (parentFolderOrId==='appDataFolder'){
		metadata.spaces = 'appDataFolder';
	    } else {
		metadata.spaces = 'drive';
	    }
	    return (
		getFolderId(parentFolderOrId)
		    .then((parent)=>{
			return new Promise(function(resolve, reject){
			    const meta = Object.assign({}, metadata, {parents: [parent]});
			    const req = drive.files.create({
				resource: meta
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
		// fs.createReadStream(fname).pipe(_request(driveupload)).on('error', (e)=>(console.log(e)));
		return new Promise(function(resolve,reject){
		    const uploadRequest = request(driveupload, (err, httpIncomingMessage, response)=>{
			if (err) return reject(err);
			resolve(response);
		    });
		    localStream.pipe(uploadRequest);
		});
	    }
	    return Promise.reject("drive.x.streamToUrl: not a valid url");
	};
    }

    x.streamToUrl = streamToUrl;

    function checkDuplicates(files){
	if ((!files) || (files.length===0))
	    throw(404);
	if (files.length>1)
	    throw(new Error("checkDuplicates: failed, multiple files with same name"));
	return files[1];
    }

    x.checkDuplicates = checkDuplicates;

    function streamToDrive({ rootFolderId, folderPath, name, stream, mimeType, createPath, clobber}){
	function requireString(v, k){
	    if ((typeof(v)!=='string') || (v.length===0))
		throw new Error("drive.x.upload2, invalid parameter "+k+", requires non-empty string");
	}
	requireString(rootFolderId, 'rootFolderId');
	requireString(folderPath, 'folderPath');
	requireString(name,'name');
	requireString(mimeType,'mimeType');
	const findAll = driveFileFinder( null, true);
	const getFolder = (createPath)? driveCreatePath( rootFolderId, folderPath): driveFindPath( rootFolderId, folderPath);
	function go(parent){
	    const pUploadUrl = driveUploadDirector( parent);
	    return (
		pUploadUrl({name, mimeType})
		    .then(streamToUrl(stream, mimeType))
			);
	}

	const c = {}; // cache for parent
	
	const common = (getFolder
			.then(getFolderId)
			.then((parent)=>{ c.parent = parent; return parent; })
			.then((parent)=>(findAll(parent,name)))
		       );

	if (clobber){
	    return (common
		    .then(driveJanitor(c.parent))
		    .then(go)
		   );		
	}
	
	return (common
		.then(()=>(Promise.reject(new Error("drive.x.upload2: file exists and clobber not set"))),
		      (e)=>{ return ((e===404)? go(c.parent) : Promise.reject(e)); })
	       );
    }

    x.upload2 = streamToDrive;

    return x;
}
