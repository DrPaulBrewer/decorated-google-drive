// Copyright 2017 Paul Brewer - Economic and Financial Technology Consulting LLC <drpaulbrewer@eaftc.com>
// License: MIT

// jshint esversion:6, strict:global, node:true, mocha: true

"use strict";

const assert = require('assert');
const should = require('should');
const google = require('googleapis');
const request = require('request');
const fs = require('fs');
const str = require('string-to-stream');
const Boom = require('boom');
const pify = require('pify');
const folderMimeType = 'application/vnd.google-apps.folder';

const keys = {
    key: process.env.GOOGLE_DRIVE_CLIENT_ID,
    secret: process.env.GOOGLE_DRIVE_SECRET,
    redirect: process.env.GOOGLE_DRIVE_REDIRECT    
};

const tokens = {
    access_token: process.env.GOOGLE_DRIVE_ACCESS_TOKEN,
    refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
    expiry_date: process.env.GOOGLE_DRIVE_EXPIRY_DATE
};

const driveZ = require("../index.js");

let drive;

describe('decorated-google-drive:', function(){
    describe(' initializing ', function(){
	it('should not throw an error', function(){
	    function init(){
		drive = driveZ(google, request, keys, tokens);
	    }
	    init.should.not.throw();
	});
	it('drive should not be undefined', function(){
	    assert.ok(!!drive);
	});
	it('drive.x should be an object', function(){
	    assert.equal(typeof(drive.x),'object');
	});
    });
    describe(' drive.x.aboutMe ', function(){
	it('should return the test users email address',function(){
	    return drive.x.aboutMe().then((info)=>{
		assert.ok(info.user.emailAddress.endsWith("@gmail.com"));
	    });
	});
	it('should return a storageQuota object with properties limit, usage', function(){
	    return drive.x.aboutMe().then((info)=>{
		const quota = info.storageQuota;
		assert.ok(typeof(quota)==='object');
		quota.should.have.properties('limit','usage');
	    });
	});
	it('drive.about.get still works, as well, and the outputs match', function(){
	    return Promise.all([
		drive.x.aboutMe(),
		pify(drive.about.get)({fields: 'user, storageQuota'})
	    ]).then(([A,B])=>{
		A.should.deepEqual(B);
	    });
	});
    });
    describe(' drive.x.appDataFolder.upload2: upload a string to appDataFolder ', function(){
	let uploadResult;
	before(function(){
	    return drive.x.appDataFolder.upload2({
		folderPath: '',
		name: 'myaccount',
		stream: str('Hello-World-Test-1-2-3'),
		mimeType: 'text/plain',
		createPath: false,
		clobber: true
	    }).then((info)=>{ uploadResult = info; });
	});
	it("uploading the string to appDataFolder file myaccount should resolve with expected file metadata", function(){
	    uploadResult.should.be.type("object");
	    uploadResult.should.have.properties('id','name','mimeType','isNew','parents');
	    uploadResult.name.should.equal("myaccount");
	    uploadResult.mimeType.should.equal("text/plain");
	    uploadResult.isNew.should.equal(true);
	});
	it("drive.x.appDataFolder.searcher should report there is exactly one myaccount file in the folder and it should match upload file id", function(){
	    drive.x.appDataFolder.searcher({})('appDataFolder','myaccount').then((found)=>{
		found.should.have.properties('parent','name','files');
		found.files.length.should.equal(1);
		found.files[0].id.should.equal(uploadResult.id);
	    });
	});
	it("drive.x.appDataFolder.contents should resolve to contents Hello-World-Test-1-2-3", function(){
	    drive.x.appDataFolder.contents(uploadResult.id).then((contents)=>{
		contents.should.be.type("string");
		contents.should.equal('Hello-World-Test-1-2-3');
	    });
	});
    });
    describe(' drive.x.upload2: upload a file README.md to Drive folder /path/to/test/Files', function(){
	let uploadResult;
	before(function(){
	    return drive.x.upload2({
		folderPath: '/path/to/test/Files/',
		name: 'README.md',
		stream: fs.createReadStream("./README.md"),
		mimeType: 'text/plain',
		createPath: true,
		clobber: true
	    }).then((info)=>{ uploadResult = info; });
	});
	it("uploading the README.md file to /path/to/test/Files/README.md should resolve with expected file metadata", function(){
	    uploadResult.should.be.type("object");
	    uploadResult.should.have.properties('id','name','mimeType','isNew','parents');
	    uploadResult.id.length.should.be.above(1);
	    uploadResult.name.should.equal("README.md");
	    uploadResult.mimeType.should.equal("text/plain");
	    uploadResult.isNew.should.equal(true);
	    assert.ok(Array.isArray(uploadResult.parents), "uploadResult.parents should be an Array");
	    assert.ok(uploadResult.parents.length===1, "uploadResult.parents.length should be 1");
	    uploadResult.parents[0].should.be.type('string');
	});
	it("the parents[0] folder should have the name 'Files'", function(done){
	    drive.files.get({fileId: uploadResult.parents[0]}, function(e,data){
		if (e) throw e;
		data.name.should.equal('Files');
		done();
	    });
	});
	it("searching the parents[0] folder for README.md find a file with matching id", function(){
	    return (drive.x.searcher({trashed:false})(uploadResult.parents[0], 'README.md')
		    .then((info)=>{
			assert.ok(Array.isArray(info.files), "info.files is array");
			info.files[0].name.should.equal('README.md');
			info.files[0].id.should.equal(uploadResult.id);
		    })
		   );
	});
    });
    describe(' after drive.x.upload2 ', function(){
	it("searching root for anything should yield folder 'path' with .isFolder===true", function(){
	    return (drive.x.searcher({trashed:false})('root')
		    .then((info)=>{
			assert.ok(Array.isArray(info.files), "info.files is array");
			assert.ok(info.files.some((f)=>((f.mimeType===folderMimeType) && (f.name==='path') && f.isFolder)), "info.files contains folder 'path'");
			assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
		    })
		   );
	});

	it("searching root for folders should yield folder 'path' with .isFolder===true", function(){
	    return (drive.x.searcher({
		trashed: false,
		isFolder: true
	    })('root').then((info)=>{
		assert.ok(Array.isArray(info.files), "info.files is array");
		assert.ok(info.files.some((f)=>((f.mimeType===folderMimeType) && (f.name==='path') && f.isFolder )), "info.files contains folder 'path'");
		assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
	    })
		   );
	});

	it("searching root for non-folders should be empty ", function(){
	    return (drive.x.searcher({
		trashed: false,
		isFolder: false
	    })('root').then((info)=>{
		assert.ok(Array.isArray(info.files), "info.files is array");
		assert.ok(info.files.length===0, "info.files should be empty");
	    })
		   );
	});

	it("searching all folders for any non-trashed file should be non-empty and include file README.md in results ", function(){
	    return (drive.x.searcher({
		trashed: false,
		isFolder: false
	    })().then((info)=>{
		assert.ok(Array.isArray(info.files), "info.files is array");
		assert.ok(info.files.some((f)=>((f.name==='README.md') && (!f.isFolder) && (!f.isNew))));
		assert.ok(info.files.length>0, "info.files should be non-empty");
	    })
		   );
	});

	it("searching all folders or a file with appProperties: { 'role': 'documentation' } should be empty ", function(){
	    return (drive.x.searcher({
		appProperties: {
		    'role': 'documentation'
		}
	    })().then((info)=>{
		assert.ok(info.files.length===0, "info.files should be empty");
	    })
		   );
	});
	
	it("checking existence of /path/to/test/Files/README.md with drive.x.findPath should yield expected file metadata", function(){
	    return drive.x.findPath("/path/to/test/Files/README.md").then((info)=>{
		info.should.have.properties('id','name','mimeType','isFolder');
		info.isFolder.should.equal(false);
		info.id.length.should.be.above(1);
		info.name.should.equal("README.md");
		info.mimeType.should.equal("text/plain");
		assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
	    });
	});

	it("checking existence of /path/to/test should yield expected folder metadata", function(){
	    return drive.x.findPath("/path/to/test").then((info)=>{
		info.should.have.properties('id','name','mimeType','isFolder');
		info.isFolder.should.equal(true);
		info.id.length.should.be.above(1);
		info.name.should.equal("test");
		info.mimeType.should.equal(folderMimeType);
		assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
	    });
	});
	
	it('checking existence on wrong path should throw Boom.notfound', function(){
	    // note: folder names seem to ignore upper/lower case
	    return drive.x.findPath("/not/the/path/to/test/Files/README.md").then(
		(info)=>{ console.log(info); throw new Error("unexpected success"); },
		(e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return Promise.resolve("ok, got Boom 404"); throw e; }
	    );
	});
	
	it("downloading content with drive.x.download should yield contents string including 'License: MIT'", function(){
	    return drive.x.download("/path/to/test/Files/README.md").then((contents)=>{
		contents.should.be.type('string');
		assert.ok(contents.includes("License: MIT"));
	    });
	});

	it("updating README.md appProperties to {'role': 'documentation'} should succeed", function(){
	    return (drive.x.findPath("/path/to/test/Files/README.md")
		    .then((file)=>(drive.x.updateMetadata(file.id, { appProperties: {role: 'documentation'}, description: "read this first" })))
		    .then((info)=>{
			// checks response from drive.x.updateMetadata
			info.appProperties.role.should.equal('documentation');
			info.description.should.equal('read this first');
			return drive.files.get({fileId: info.id, fields: "id,name,description,appProperties"});
		    }).then((info)=>{
			// checks response from subsequent drive.files.get
			info.description.should.equal("read this first");
			info.appProperties.role.should.equal('documentation');
		    })
		   );
	});

	it("searching all folders or a file with appProperties: { 'role': 'documentation' } should find README.md ", function(){
	    return (drive.x.searcher({
		appProperties: {
		    'role': 'documentation'
		}
	    })().then((info)=>{
		assert.ok(info.files.length===1, "info.files should contain one file");
		assert.ok(info.files[0].name==="README.md", "info.files[0].name should be README.md");
		info.files[0].appProperties.role.should.equal('documentation');
		assert.ok(typeof(info.files[0].description)==='undefined', "info.files[0].description should be undefined");
	    })
		   );
	});
	
	it("drive.x.upload2 uploading the file again with {clobber:false} will throw Boom.conflict error because file already exists", function(){
	    return drive.x.upload2({
		folderPath: '/path/to/test/Files/',
		name: 'README.md',
		stream: fs.createReadStream("./README.md"),
		mimeType: 'text/plain',
		createPath: true,
		clobber: false
	    }).then((info)=>{throw new Error("unexpected success");}, (e)=>{ if(e.isBoom && e.typeof===Boom.conflict) return Promise.resolve('ok'); throw e; });
	});
    });
    describe(' drive.x.upload2: upload test/test.zip to Drive folder /path/to/test/Files', function(){
	let uploadResult;
	let testMD5 = fs.readFileSync('./test/test.md5','utf8');
	before(function(){
	    return drive.x.upload2({
		folderPath: '/path/to/test/Files/',
		name: 'test.zip',
		stream: fs.createReadStream("./test/test.zip"),
		mimeType: 'application/zip',
		createPath: true,
		clobber: true
	    }).then((info)=>{ uploadResult = info; });
	});
	it("uploading the test.zip file to /path/to/test/Files/test.zip should resolve with expected file metadata and md5 match", function(){
	    uploadResult.should.be.type("object");
	    uploadResult.should.have.properties('id','name','mimeType','md5Checksum','ourMD5','isNew','isFolder');
	    uploadResult.id.length.should.be.above(1);
	    uploadResult.name.should.equal("test.zip");
	    uploadResult.mimeType.should.equal("application/zip");
	    uploadResult.ourMD5.should.equal(uploadResult.md5Checksum);
	    uploadResult.ourMD5.should.equal(testMD5);
	    uploadResult.isNew.should.equal(true);
	    uploadResult.isFolder.should.equal(false);
	});
    });
    describe(' create folder /path/to/test2 ', function(){
	let test2Folder = null;
	before(function(){
	    return drive.x.createPath('/path/to/test2').then((f)=>{ test2Folder=f; });
	});
	it(' the resolved folder object should be an object with props id, name, mimeType, isFolder ' , function(){
	    test2Folder.should.be.type("object");
	    test2Folder.should.have.properties('id','name','mimeType','isFolder','isNew','parents');
	});
	it(' the folder.id should be a string with length >4 ',function(){
	    test2Folder.id.should.be.type('string');
	    test2Folder.id.length.should.be.above(4);
	});
	it(' the folder.name should be "test2" ', function(){
	    test2Folder.name.should.equal('test2');
	});
	it(' the mimeType should be '+folderMimeType+' ', function(){
	    test2Folder.mimeType.should.equal(folderMimeType);
	});
	it( ' isNew should be true ', function(){
	    test2Folder.isNew.should.equal(true);
	});
	it( ' isFolder should be true ', function(){
	    test2Folder.isFolder.should.equal(true);
	});
	it( ' parents should be an Array containing 1 string ', function(){
	    assert.ok(Array.isArray(test2Folder.parents), "test2Folder.parents should be an Array");
	    assert.ok(test2Folder.parents.length===1, "test2Folder.parents.length should be 1");
	    test2Folder.parents[0].should.be.type('string');
	});
    });
    describe(' use folderId of /path/to/test2 to upload test.zip ', function(){
	let uploadResult = null;
	let testMD5 = fs.readFileSync('./test/test.md5','utf8');
	before(function(){
	    return drive.x.findPath('/path/to/test2').then((test2Folder)=>{
		if (!test2Folder.id) throw new Error("test2Folder.id undefined");
		return drive.x.upload2({
		    folderId: test2Folder.id,
		    name: 'test.zip',
		    stream: fs.createReadStream("./test/test.zip"),
		    mimeType: 'application/zip',
		    createPath: false,
		    clobber: false
		}).then((info)=>{ uploadResult = info; });
	    });
	});
	it("uploading the test.zip file to /path/to/test2/test.zip should resolve with expected file metadata and md5 match", function(){
	    uploadResult.should.be.type("object");
	    uploadResult.should.have.properties('id','name','mimeType','md5Checksum','ourMD5');
	    uploadResult.id.length.should.be.above(1);
	    uploadResult.name.should.equal("test.zip");
	    uploadResult.mimeType.should.equal("application/zip");
	    uploadResult.isNew.should.equal(true);
	    uploadResult.isFolder.should.equal(false);
	    uploadResult.ourMD5.should.equal(uploadResult.md5Checksum);
	    uploadResult.ourMD5.should.equal(testMD5);
	});
    });

    describe(" cleanup via drive.x.janitor ", function(){
	let janitor;
	before(function(){
	    janitor = drive.x.janitor(null,'deleted');
	});
	it('janitor hopefully deletes the README.md file(s) OK and resolves correctly', function(){
	    return drive.x.findPath("/path/to/test/Files/README.md").then(janitor).then((response)=>{
		response.should.have.properties('deleted');
		assert.ok(response.deleted);
	    });
	});
	it('drive.x.findPath will throw Boom.notFound if the file was successfully deleted', function(){
	    return drive.x.findPath("/path/to/test/Files/README.md").then(janitor).then(
		(response)=>{ throw new Error("unexpected success");},
		(e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return Promise.resolve("ok"); throw e; }
	    );
	});
	it('janitor will throw an error if told to delete an invalid file', function(){
	    return janitor([{id: 'invalid'}]).then(
		(response)=>{ throw new Error("unexpected success"); },
		(e)=>{ if (e.toString().includes('not found')) return Promise.resolve('ok'); throw e; }
	    );
	});
	it('janitor should not throw an error if given an empty filelist', function(){
	    return janitor([]).then((response)=>{
		response.should.have.property('deleted');
		assert.ok(!response.deleted);
	    });
	});
	it('final cleanup: delete the path folder and check non-existence', function(){
	    return (drive.x.findPath("/path")
		    .then(janitor)
		    .then(()=>(drive.x.findPath("/path")))
		    .then((meta)=>{ throw new Error("unexpected success"); },
			  (e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return Promise.resolve("ok"); throw e; }
			 )
		   );
	});
    });
    
});
