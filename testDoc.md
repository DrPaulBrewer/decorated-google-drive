# TOC
   - [decorated-google-drive:](#decorated-google-drive)
     - [ initializing ](#decorated-google-drive-initializing-)
     - [ drive.x.aboutMe ](#decorated-google-drive-drivexaboutme-)
     - [ drive.x.appDataFolder.upload2: upload a string to appDataFolder ](#decorated-google-drive-drivexappdatafolderupload2-upload-a-string-to-appdatafolder-)
     - [ drive.x.upload2: upload a file README.md to Drive folder /path/to/test/Files](#decorated-google-drive-drivexupload2-upload-a-file-readmemd-to-drive-folder-pathtotestfiles)
     - [ after drive.x.upload2 ](#decorated-google-drive-after-drivexupload2-)
     - [ drive.x.upload2: upload test/test.zip to Drive folder /path/to/test/Files](#decorated-google-drive-drivexupload2-upload-testtestzip-to-drive-folder-pathtotestfiles)
     - [ cleanup via drive.x.janitor ](#decorated-google-drive-cleanup-via-drivexjanitor-)
<a name=""></a>
 
<a name="decorated-google-drive"></a>
# decorated-google-drive:
<a name="decorated-google-drive-initializing-"></a>
##  initializing 
should not throw an error.

```js
function init(){
	drive = driveZ(google, request, keys, tokens);
    }
    init.should.not.throw();
```

<a name="decorated-google-drive-drivexaboutme-"></a>
##  drive.x.aboutMe 
should return the test users email address.

```js
return drive.x.aboutMe().then((info)=>{
	assert.ok(info.user.emailAddress.endsWith("@gmail.com"));
    });
```

should return a storageQuota object with properties limit, usage.

```js
return drive.x.aboutMe().then((info)=>{
	const quota = info.storageQuota;
	assert.ok(typeof(quota)==='object');
	quota.should.have.properties('limit','usage');
    });
```

drive.about.get still works, as well, and the outputs match.

```js
return Promise.all([
	drive.x.aboutMe(),
	pify(drive.about.get)({fields: 'user, storageQuota'})
    ]).then(([A,B])=>{
	A.should.deepEqual(B);
    });
```

<a name="decorated-google-drive-drivexappdatafolderupload2-upload-a-string-to-appdatafolder-"></a>
##  drive.x.appDataFolder.upload2: upload a string to appDataFolder 
uploading the string to appDataFolder file myaccount should resolve with expected file metadata.

```js
uploadResult.should.be.type("object");
    uploadResult.should.have.properties('id','name','mimeType');
    uploadResult.name.should.equal("myaccount");
    uploadResult.mimeType.should.equal("text/plain");
```

drive.x.appDataFolder.searcher should report there is exactly one myaccount file in the folder and it should match upload file id.

```js
drive.x.appDataFolder.searcher({})('appDataFolder','myaccount').then((found)=>{
	found.should.have.properties('parent','name','files');
	found.files.length.should.equal(1);
	found.files[0].id.should.equal(uploadResult.id);
    });
```

drive.x.appDataFolder.contents should resolve to contents Hello-World-Test-1-2-3.

```js
drive.x.appDataFolder.contents(uploadResult.id).then((contents)=>{
	contents.should.be.type("string");
	contents.should.equal('Hello-World-Test-1-2-3');
    });
```

<a name="decorated-google-drive-drivexupload2-upload-a-file-readmemd-to-drive-folder-pathtotestfiles"></a>
##  drive.x.upload2: upload a file README.md to Drive folder /path/to/test/Files
uploading the README.md file to /path/to/test/Files/README.md should resolve with expected file metadata.

```js
uploadResult.should.be.type("object");
    uploadResult.should.have.properties('id','name','mimeType');
    uploadResult.id.length.should.be.above(1);
    uploadResult.name.should.equal("README.md");
    uploadResult.mimeType.should.equal("text/plain");
```

<a name="decorated-google-drive-after-drivexupload2-"></a>
##  after drive.x.upload2 
checking existence with drive.x.findPath should yield expected file metadata.

```js
return drive.x.findPath("/path/to/test/Files/README.md").then((info)=>{
	info.should.have.properties('id','name','mimeType');
	info.id.length.should.be.above(1);
	info.name.should.equal("README.md");
	info.mimeType.should.equal("text/plain");
    });
```

checking existence on wrong path should throw Boom.notfound.

```js
// note: folder names seem to ignore upper/lower case
    return drive.x.findPath("/not/the/path/to/test/Files/README.md").then(
	(info)=>{ console.log(info); throw new Error("unexpected success"); },
	(e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return Promise.resolve("ok, got Boom 404"); throw e; }
    );
```

downloading content with drive.x.download should yield contents string including 'License: MIT'.

```js
return drive.x.download("/path/to/test/Files/README.md").then((contents)=>{
	contents.should.be.type('string');
	assert.ok(contents.includes("License: MIT"));
    });
```

drive.x.upload2 uploading the file again with {clobber:false} will throw Boom.conflict error because file already exists.

```js
return drive.x.upload2({
	folderPath: '/path/to/test/Files/',
	name: 'README.md',
	stream: fs.createReadStream("./README.md"),
	mimeType: 'text/plain',
	createPath: true,
	clobber: false
    }).then((info)=>{throw new Error("unexpected success");}, (e)=>{ if(e.isBoom && e.typeof===Boom.conflict) return Promise.resolve('ok'); throw e; });
```

<a name="decorated-google-drive-drivexupload2-upload-testtestzip-to-drive-folder-pathtotestfiles"></a>
##  drive.x.upload2: upload test/test.zip to Drive folder /path/to/test/Files
uploading the README.md file to /path/to/test/Files/test.zip should resolve with expected file metadata and md5 match.

```js
uploadResult.should.be.type("object");
    uploadResult.should.have.properties('id','name','mimeType','md5Checksum','ourMD5');
    uploadResult.id.length.should.be.above(1);
    uploadResult.name.should.equal("test.zip");
    uploadResult.mimeType.should.equal("application/zip");
    uploadResult.ourMD5.should.equal(uploadResult.md5Checksum);
    uploadResult.ourMD5.should.equal(testMD5);
```

<a name="decorated-google-drive-cleanup-via-drivexjanitor-"></a>
##  cleanup via drive.x.janitor 
janitor hopefully deletes the README.md file(s) OK and resolves correctly.

```js
return drive.x.findPath("/path/to/test/Files/README.md").then(janitor).then((response)=>{
	response.should.have.properties('deleted');
	assert.ok(response.deleted);
    });
```

drive.x.findPath will throw Boom.notFound if the file was successfully deleted.

```js
return drive.x.findPath("/path/to/test/Files/README.md").then(janitor).then(
	(response)=>{ throw new Error("unexpected success");},
	(e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return Promise.resolve("ok"); throw e; }
    );
```

janitor will throw an error if told to delete an invalid file.

```js
return janitor([{id: 'invalid'}]).then(
	(response)=>{ throw new Error("unexpected success"); },
	(e)=>{ if (e.toString().includes('not found')) return Promise.resolve('ok'); throw e; }
    );
```

janitor should not throw an error if given an empty filelist.

```js
return janitor([]).then((response)=>{
	response.should.have.property('deleted');
	assert.ok(!response.deleted);
    });
```

final cleanup: delete the path folder and check non-existence.

```js
return (drive.x.findPath("/path")
	    .then(janitor)
	    .then(()=>(drive.x.findPath("/path")))
	    .then((meta)=>{ throw new Error("unexpected success"); },
		  (e)=>{ if (e.isBoom && e.typeof===Boom.notFound) return Promise.resolve("ok"); throw e; }
		 )
	   );
```

