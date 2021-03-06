# TOC
   - [decorated-google-drive:](#decorated-google-drive)
     - [ initializing ](#decorated-google-drive-initializing-)
     - [ drive.x.aboutMe ](#decorated-google-drive-drivexaboutme-)
     - [ drive.x.hexid ](#decorated-google-drive-drivexhexid-)
     - [ drive.x.appDataFolder.upload2: upload a string ...-1-2-3 to appDataFolder ](#decorated-google-drive-drivexappdatafolderupload2-upload-a-string-1-2-3-to-appdatafolder-)
     - [ drive.x.upload2: upload a file README.md to Drive folder /path/to/test/Files](#decorated-google-drive-drivexupload2-upload-a-file-readmemd-to-drive-folder-pathtotestfiles)
     - [ after drive.x.upload2 ](#decorated-google-drive-after-drivexupload2-)
     - [ drive.x.upload2: upload test/test.zip to Drive folder /path/to/test/Files](#decorated-google-drive-drivexupload2-upload-testtestzip-to-drive-folder-pathtotestfiles)
     - [ create folder /path/to/test2 ](#decorated-google-drive-create-folder-pathtotest2-)
     - [ use folderId of /path/to/test2 to upload test.zip ](#decorated-google-drive-use-folderid-of-pathtotest2-to-upload-testzip-)
     - [ cleanup via drive.x.janitor ](#decorated-google-drive-cleanup-via-drivexjanitor-)
<a name=""></a>
 
<a name="decorated-google-drive"></a>
# decorated-google-drive:
<a name="decorated-google-drive-initializing-"></a>
##  initializing 
should not throw an error.

```js
function init() {
  drive = driveZ({google, axios, keys, tokens, salt});
}
init.should.not.throw();
```

drive should not be undefined.

```js
assert.ok(!!drive);
```

drive.x should be an object.

```js
assert.equal(typeof(drive.x), 'object');
```

<a name="decorated-google-drive-drivexaboutme-"></a>
##  drive.x.aboutMe 
should return the test users email address.

```js
return drive.x.aboutMe().then((info) => {
  assert.ok(info.user.emailAddress.endsWith("@gmail.com"));
});
```

should return a storageQuota object with properties limit, usage.

```js
return drive.x.aboutMe().then((info) => {
  const quota = info.storageQuota;
  assert.ok(typeof(quota) === 'object');
  quota.should.have.properties('limit', 'usage');
});
```

drive.about.get still works, as well, and the outputs match.

```js
return Promise.all([
  drive.x.aboutMe(),
  drive.about.get({ fields: 'user, storageQuota' }).then((res)=>(res.data))
]).then(([A, B]) => {
  A.should.deepEqual(B);
});
```

<a name="decorated-google-drive-drivexhexid-"></a>
##  drive.x.hexid 
should return a 64 char hex id.

```js
async function(){
      const hex = await drive.x.hexid();
      return hex.should.match(sha256Regex);
    }
```

should consistently return the same 64 char hex when called 3 times.

```js
async function(){
      return Promise
        .all([drive.x.hexid(), drive.x.hexid(), drive.x.hexid()])
        .then(([a,b,c])=>{
          a.should.match(sha256Regex);
          a.should.equal(b);
          a.should.equal(c);
        });
    }
```

<a name="decorated-google-drive-drivexappdatafolderupload2-upload-a-string-1-2-3-to-appdatafolder-"></a>
##  drive.x.appDataFolder.upload2: upload a string ...-1-2-3 to appDataFolder 
uploading the string to appDataFolder file myaccount should resolve with expected file metadata.

```js
uploadResult.should.be.type("object");
uploadResult.should.have.properties('id', 'name', 'mimeType', 'isNew', 'parents');
uploadResult.name.should.equal("myaccount");
uploadResult.mimeType.should.equal("text/plain");
uploadResult.isNew.should.equal(true);
```

drive.x.appDataFolder.searcher should report there is exactly one myaccount file in the folder and it should match upload file id.

```js
drive.x.appDataFolder.searcher({})('appDataFolder', 'myaccount').then((found) => {
  found.should.have.properties('parent', 'name', 'files');
  found.files.length.should.equal(1);
  found.files[0].id.should.equal(uploadResult.id);
});
```

drive.x.appDataFolder.contents should resolve to contents Hello-World-Test-1-2-3.

```js
drive.x.appDataFolder.contents(uploadResult.id).then((contents) => {
  contents.should.be.type("string");
  contents.should.equal('Hello-World-Test-1-2-3');
});
```

<a name="decorated-google-drive-drivexupload2-upload-a-file-readmemd-to-drive-folder-pathtotestfiles"></a>
##  drive.x.upload2: upload a file README.md to Drive folder /path/to/test/Files
uploading the README.md file to /path/to/test/Files/README.md should resolve with expected file metadata.

```js
uploadResult.should.be.type("object");
uploadResult.should.have.properties('id', 'name', 'mimeType', 'isNew', 'parents');
uploadResult.id.length.should.be.above(1);
uploadResult.name.should.equal("README.md");
uploadResult.mimeType.should.equal("text/plain");
uploadResult.isNew.should.equal(true);
assert.ok(Array.isArray(uploadResult.parents), "uploadResult.parents should be an Array");
assert.ok(uploadResult.parents.length === 1, "uploadResult.parents.length should be 1");
uploadResult.parents[0].should.be.type('string');
```

the parents[0] folder should have the name 'Files'.

```js
drive.files.get({ fileId: uploadResult.parents[0] }, function (e, response) {
  if (e) throw e;
  response.data.name.should.equal('Files');
  done();
});
```

searching the parents[0] folder for README.md find a file with matching id.

```js
return (drive.x.searcher({ trashed: false })(uploadResult.parents[0], 'README.md')
  .then((info) => {
    assert.ok(Array.isArray(info.files), "info.files is array");
    info.files[0].name.should.equal('README.md');
    info.files[0].id.should.equal(uploadResult.id);
  })
);
```

<a name="decorated-google-drive-after-drivexupload2-"></a>
##  after drive.x.upload2 
searching root for anything should yield folder 'path' with .isFolder===true.

```js
return (drive.x.searcher({ trashed: false })('root')
  .then((info) => {
    assert.ok(Array.isArray(info.files), "info.files is array");
    assert.ok(info.files.some((f) => ((f.mimeType === folderMimeType) && (f.name === 'path') && f.isFolder)), "info.files contains folder 'path'");
    assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
  })
);
```

searching root for folders should yield folder 'path' with .isFolder===true.

```js
return (drive.x.searcher({
  trashed: false,
  isFolder: true
})('root').then((info) => {
  assert.ok(Array.isArray(info.files), "info.files is array");
  assert.ok(info.files.some((f) => ((f.mimeType === folderMimeType) && (f.name === 'path') && f.isFolder)), "info.files contains folder 'path'");
  assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
}));
```

searching root for non-folders should be empty .

```js
return (drive.x.searcher({
  trashed: false,
  isFolder: false
})('root').then((info) => {
  assert.ok(Array.isArray(info.files), "info.files is array");
  assert.ok(info.files.length === 0, "info.files should be empty");
}));
```

searching all folders for any non-trashed file should be non-empty and include file README.md in results .

```js
return (drive.x.searcher({
  trashed: false,
  isFolder: false
})().then((info) => {
  assert.ok(Array.isArray(info.files), "info.files is array");
  assert.ok(info.files.some((f) => ((f.name === 'README.md') && (!f.isFolder) && (!f.isNew))));
  assert.ok(info.files.length > 0, "info.files should be non-empty");
}));
```

searching all folders or a file with appProperties: { 'role': 'documentation' } should be empty .

```js
return (drive.x.searcher({
  appProperties: {
    'role': 'documentation'
  }
})().then((info) => {
  assert.ok(info.files.length === 0, "info.files should be empty");
}));
```

checking existence of /path/to/test/Files/README.md with drive.x.findPath should yield expected file metadata.

```js
return drive.x.findPath("/path/to/test/Files/README.md").then((info) => {
  info.should.have.properties('id', 'name', 'mimeType', 'isFolder');
  info.isFolder.should.equal(false);
  info.id.length.should.be.above(1);
  info.name.should.equal("README.md");
  info.mimeType.should.equal("text/plain");
  assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
});
```

checking existence of /path/to/test should yield expected folder metadata.

```js
return drive.x.findPath("/path/to/test").then((info) => {
  info.should.have.properties('id', 'name', 'mimeType', 'isFolder');
  info.isFolder.should.equal(true);
  info.id.length.should.be.above(1);
  info.name.should.equal("test");
  info.mimeType.should.equal(folderMimeType);
  assert.ok(!info.isNew, "info.isNew should be falsey or undefined");
});
```

checking existence on wrong path should throw Boom.notfound.

```js
// note: folder names seem to ignore upper/lower case
return drive.x.findPath("/not/the/path/to/test/Files/README.md").then(
  () => { throw new Error("unexpected success"); },
  (e) => { if (e.isBoom && e.typeof === Boom.notFound) return Promise.resolve("ok, got Boom 404");throw e; }
);
```

downloading content with drive.x.download should yield contents string including 'License: MIT'.

```js
return drive.x.download("/path/to/test/Files/README.md").then((contents) => {
  contents.should.be.type('string');
  assert.ok(contents.includes("License: MIT"));
});
```

updating README.md appProperties to {'role': 'documentation'} should succeed.

```js
return (drive.x.findPath("/path/to/test/Files/README.md")
  .then((file) => (drive.x.updateMetadata(file.id, { appProperties: { role: 'documentation' }, description: "read this first" })))
  .then((info) => {
    // checks response from drive.x.updateMetadata
    info.appProperties.role.should.equal('documentation');
    info.description.should.equal('read this first');
    return drive.files.get({ fileId: info.id, fields: "id,name,description,appProperties" }).then((resp)=>(resp.data));
  }).then((info) => {
    // checks response from subsequent drive.files.get
    info.description.should.equal("read this first");
    info.appProperties.role.should.equal('documentation');
  })
);
```

searching all folders or a file with appProperties: { 'role': 'documentation' } should find README.md .

```js
return (drive.x.searcher({
  appProperties: {
    'role': 'documentation'
  }
})().then((info) => {
  assert.ok(info.files.length === 1, "info.files should contain one file");
  assert.ok(info.files[0].name === "README.md", "info.files[0].name should be README.md");
  info.files[0].appProperties.role.should.equal('documentation');
  assert.ok(typeof(info.files[0].description) === 'undefined', "info.files[0].description should be undefined");
}));
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
}).then(() => { throw new Error("unexpected success"); }, (e) => { if (e.isBoom && e.typeof === Boom.conflict) return Promise.resolve('ok');throw e; });
```

<a name="decorated-google-drive-drivexupload2-upload-testtestzip-to-drive-folder-pathtotestfiles"></a>
##  drive.x.upload2: upload test/test.zip to Drive folder /path/to/test/Files
uploading the test.zip file to /path/to/test/Files/test.zip should resolve with expected file metadata and md5 match.

```js
uploadResult.should.be.type("object");
uploadResult.should.have.properties('id', 'name', 'mimeType', 'md5Checksum', 'ourMD5', 'isNew', 'isFolder');
uploadResult.id.length.should.be.above(1);
uploadResult.name.should.equal("test.zip");
uploadResult.mimeType.should.equal("application/zip");
uploadResult.ourMD5.should.equal(uploadResult.md5Checksum);
uploadResult.ourMD5.should.equal(testMD5);
uploadResult.isNew.should.equal(true);
uploadResult.isFolder.should.equal(false);
```

<a name="decorated-google-drive-create-folder-pathtotest2-"></a>
##  create folder /path/to/test2 
 the resolved folder object should be an object with props id, name, mimeType, isFolder .

```js
test2Folder.should.be.type("object");
test2Folder.should.have.properties('id', 'name', 'mimeType', 'isFolder', 'isNew', 'parents');
```

 the folder.id should be a string with length >4 .

```js
test2Folder.id.should.be.type('string');
test2Folder.id.length.should.be.above(4);
```

 the folder.name should be "test2" .

```js
test2Folder.name.should.equal('test2');
```

 the mimeType should be application/vnd.google-apps.folder .

```js
test2Folder.mimeType.should.equal(folderMimeType);
```

 isNew should be true .

```js
test2Folder.isNew.should.equal(true);
```

 isFolder should be true .

```js
test2Folder.isFolder.should.equal(true);
```

 parents should be an Array containing 1 string .

```js
assert.ok(Array.isArray(test2Folder.parents), "test2Folder.parents should be an Array");
assert.ok(test2Folder.parents.length === 1, "test2Folder.parents.length should be 1");
test2Folder.parents[0].should.be.type('string');
```

<a name="decorated-google-drive-use-folderid-of-pathtotest2-to-upload-testzip-"></a>
##  use folderId of /path/to/test2 to upload test.zip 
uploading the test.zip file to /path/to/test2/test.zip should resolve with expected file metadata and md5 match.

```js
uploadResult.should.be.type("object");
uploadResult.should.have.properties('id', 'name', 'mimeType', 'md5Checksum', 'ourMD5');
uploadResult.id.length.should.be.above(1);
uploadResult.name.should.equal("test.zip");
uploadResult.mimeType.should.equal("application/zip");
uploadResult.isNew.should.equal(true);
uploadResult.isFolder.should.equal(false);
uploadResult.ourMD5.should.equal(uploadResult.md5Checksum);
uploadResult.ourMD5.should.equal(testMD5);
```

<a name="decorated-google-drive-cleanup-via-drivexjanitor-"></a>
##  cleanup via drive.x.janitor 
janitor hopefully deletes the README.md file(s) OK and resolves correctly.

```js
return drive.x.findPath("/path/to/test/Files/README.md").then(janitor).then((response) => {
  response.should.have.properties('deleted');
  assert.ok(response.deleted);
});
```

drive.x.findPath will throw Boom.notFound if the file was successfully deleted.

```js
return drive.x.findPath("/path/to/test/Files/README.md").then(janitor).then(
  () => { throw new Error("unexpected success"); },
  (e) => { if (e.isBoom && e.typeof === Boom.notFound) return Promise.resolve("ok");throw e; }
);
```

janitor will throw an error if told to delete an invalid file.

```js
return janitor([{ id: 'invalid' }]).then(
  () => { throw new Error("unexpected success"); },
  (e) => { if (e.toString().includes('not found')) return Promise.resolve('ok');throw e; }
);
```

janitor should not throw an error if given an empty filelist.

```js
return janitor([]).then((response) => {
  response.should.have.property('deleted');
  assert.ok(!response.deleted);
});
```

final cleanup: delete the path folder and check non-existence.

```js
return (drive.x.findPath("/path")
  .then(janitor)
  .then(() => (drive.x.findPath("/path")))
  .then(() => { throw new Error("unexpected success"); },
    (e) => { if (e.isBoom && e.typeof === Boom.notFound) return Promise.resolve("ok");throw e; }
  )
);
```

