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
    });
    describe(' drive.x.upload2: upload a string to appDataFolder ', function(){
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
	    uploadResult.should.have.properties('id','name','mimeType');
	    uploadResult.name.should.equal("myaccount");
	    uploadResult.mimeType.should.equal("text/plain");
	});
	it("drive.x.appDataFolder.searcher should report there is exactly one myaccount file in the folder and it should match upload file id", function(){
	    drive.x.appDataFolder.searcher({})('appDataFolder','myaccount').then((found)=>{
		found.should.have.properties('parent','name','files');
		found.files.length.should.equal(1);
		found.files[0].id.should.equal(uploadResult.id);
	    });
	});
	it("file should have contents Hello-World-Test-1-2-3", function(){
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
	    uploadResult.should.have.properties('id','name','mimeType');
	    uploadResult.id.length.should.be.above(1);
	    uploadResult.name.should.equal("README.md");
	    uploadResult.mimeType.should.equal("text/plain");
	});
    });
    describe(' after drive.x.upload2 ', function(){
	it("checking existence with drive.x.findPath should yield expected file metadata", function(){
	    return drive.x.findPath("/path/to/test/Files/README.md").then((info)=>{
		info.should.have.properties('id','name','mimeType');
		info.id.length.should.be.above(1);
		info.name.should.equal("README.md");
		info.mimeType.should.equal("text/plain");
	    });
	});
	it('checking existence on wrong path should throw 404', function(){
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
	it("drive.x.upload2 uploading the file again with {clobber:false} will throw an error because file already exists", function(){
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
	it('drive.x.findPath will throw 404 if the file was successfully deleted', function(){
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
