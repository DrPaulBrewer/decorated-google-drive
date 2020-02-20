// Copyright 2017 Paul Brewer - Economic and Financial Technology Consulting LLC <drpaulbrewer@eaftc.com>
// License: MIT

/* eslint-env: node */
/* eslint max-params: "off" */

const pReduce = require('p-reduce');
const Boom = require('boom');
const ssgd = require('search-string-for-google-drive');
const crypto = require('crypto');
const upload = require('uploader-for-google-drive-resumable-upload-url');

const folderMimeType = 'application/vnd.google-apps.folder';

function extensions(drive, request, rootFolderId, spaces, salt) {
  const x = {};

  function addNew(meta) {
    if (typeof(meta) === 'object') {
      meta.isNew = true;
    }
    return meta;
  }

  function addIsFolder(meta) {
    if ((typeof(meta) === 'object') && (meta.mimeType)) {
      meta.isFolder = (meta.mimeType === folderMimeType);
    }
    return meta;
  }

  function addFieldsFromKeys(fields, obj) {
    let allfields = fields;
    Object.keys(obj).forEach((term) => {
      if ((term !== 'isFolder') && (!fields.includes(term)))
        allfields += (',' + term);
    });
    return allfields;
  }

  function getdata(resp) { return resp.data; }

  async function driveAboutMe(_fields) {
    const fields = _fields || "user,storageQuota";
    return drive.about.get({ fields }).then(getdata);
  }

  x.aboutMe = driveAboutMe;

  function hexIdFromEmail(email, secret) {
    if (!secret) throw Boom.badImplementation("missing secret");
    if (!crypto) throw Boom.badImplementation("missing crypto");
    const standardizedEmail = email.toLowerCase().trim();
    return (
      crypto
      .createHmac('sha256', secret)
      .update(standardizedEmail, 'utf8')
      .digest('hex')
    );
  }

  x.hexIdFromEmail = hexIdFromEmail;

  async function driveHexid() {
    if (!salt) throw Boom.badImplementation("missing salt");
    const info = await driveAboutMe();
    const email = info.user.emailAddress;
    return hexIdFromEmail(email, salt);
  }

  x.hexid = driveHexid;

  function driveSearcher(options) {
    let limit = (options.limit || 1000);
    let fields = options.fields || 'id,name,mimeType,modifiedTime,size,parents';
    let orderBy = options.orderby || 'folder,name,modifiedTime desc';
    const unique = options.unique;
    if (unique) limit = 2;
    const recent = options.recent;
    if (recent) {
      limit = 1;
      orderBy = 'modifiedTime desc';
    }
    const allowMatchAllFiles = options.allowMatchAllFiles;
    const searchTerms = ssgd.extract(options);

    /* each explicit searchTerm is added to default fields, except pseudoTerm isFolder */

    if (!options.fields)
      fields = addFieldsFromKeys(fields, searchTerms);

    /* convert falsey/undefined searchTerms.trashed to explicit false */

    if (!searchTerms.trashed)
      searchTerms.trashed = false;

    return async function (parent, name) {
      const search = Object.assign({}, searchTerms, { parent, name });
      const searchString = ssgd(search, allowMatchAllFiles);
      const params = {
        spaces,
        q: searchString,
        pageSize: limit,
        maxResults: limit,
        orderBy,
        fields: `files(${fields})`
      };

      // see https://developers.google.com/drive/v3/web/search-parameters

      const axiosresp = await drive.files.list(params);
      const resp = getdata(axiosresp);
      // add isFolder boolean property to files, comparing mimeType to the Google Drive folder mimeType
      if (Array.isArray(resp.files))
        resp.files.forEach(addIsFolder);
      const result = { parent, name, searchTerms, limit, unique, recent, isSearchResult: true, files: resp.files };
      return result;
    };
  }

  x.searcher = driveSearcher;

  function checkSearch(searchResult) {
    if (!Array.isArray(searchResult.files))
      throw Boom.badRequest(null, searchResult);
    if (searchResult.files.length === 0)
      throw Boom.notFound("file not found", searchResult);
    if (searchResult.unique && (searchResult.files.length > 1))
      throw Boom.expectationFailed("expected unique file", searchResult);
    if (searchResult.files.length === searchResult.files.limit)
      throw Boom.entityTooLarge('increase limit or too many files found', searchResult);
    searchResult.ok = true;
    return searchResult;
  }

  x.checkSearch = checkSearch;

  function driveJanitor(fileListProperty, successProperty) {
    async function deleteFile(file) {
      return drive.files.delete({ fileId: file.id }).then(getdata);
    }
    return async function (info) {
      if (successProperty) info[successProperty] = false;
      let files = (fileListProperty) ? info[fileListProperty] : info;
      if (files && files.id) files = [files];
      if ((Array.isArray(files)) && (files.length > 0))
        return (Promise
          .all(files.map(deleteFile))
          .then(() => {
            if (successProperty) info[successProperty] = true;
            return info;
          })
        );
      return info;
    };
  }

  x.janitor = driveJanitor;

  async function getFolderId(folderIdOrObject) {
    if (typeof(folderIdOrObject) === 'object') {
      if (folderIdOrObject.id) {
        if (folderIdOrObject.mimeType === folderMimeType)
          return folderIdOrObject.id;
      }
    }
    if (typeof(folderIdOrObject) === 'string') {
      return folderIdOrObject;
    }
    throw Boom.badRequest(null, { folder: folderIdOrObject });
  }

  x.getFolderId = getFolderId;

  function driveStepRight() {
    const search = driveSearcher({ recent: true });
    return async function (folderIdOrObject, name) {
      return (getFolderId(folderIdOrObject)
        .then((parentId) => (search(parentId, name)))
        .then(checkSearch)
        .then((searchResult) => (searchResult.files[0]))
      );
    };
  }

  x.stepRight = driveStepRight;

  // see https://developers.google.com/drive/v3/web/folder

  function driveFolderCreator() {
    return async function (f, name) {
      return (getFolderId(f)
        .then((parentFolderId) => {
          const mimeType = folderMimeType;
          const metadata = {
            mimeType,
            name,
            parents: [parentFolderId]
          };
          return drive.files.create({
            resource: metadata,
            fields: 'id, mimeType, name, parents'
          }).then(getdata).then(addNew).then(addIsFolder);
        })
      );
    };
  }

  x.folderCreator = driveFolderCreator;

  function driveFolderFactory() {
    const stepper = driveStepRight();
    const creator = driveFolderCreator();
    return async function (f, name) {
      return (stepper(f, name)
        .catch((e) => {
          if ((e.isBoom) && (e.typeof === Boom.notFound)) return creator(f, name);
          return Promise.reject(e);
        })
      );
    };
  }

  x.folderFactory = driveFolderFactory;

  async function driveFindPath(path) {
    const parts = path.split('/').filter((s) => (s.length > 0));
    const stepper = driveStepRight();
    return pReduce(parts, stepper, rootFolderId);
  }

  x.findPath = driveFindPath;

  async function driveContents(fileId, mimeType) {
    const getFile = drive.files.get({ fileId, spaces, alt: 'media' }).then(getdata);
    if (!mimeType)
      return getFile;
    return (getFile
      .catch((e) => {
        if (e.toString().includes("Use Export"))
          return (drive.files.export({ fileId, spaces, mimeType }).then(getdata));
        throw e;
      })
    );
  }

  x.contents = driveContents;

  async function driveDownload(path, mimeType) {
    return driveFindPath(path).then((file) => (driveContents(file.id, mimeType)));
  }

  x.download = driveDownload;

  async function driveCreatePath(path) {
    const parts = path.split('/').filter((s) => (s.length > 0));
    const dff = driveFolderFactory();
    return pReduce(parts, dff, rootFolderId);
  }

  x.createPath = driveCreatePath;

  async function driveUpdateMetadata(fileId, metadata) {
    const fields = addFieldsFromKeys('id,name,mimeType,modifiedTime,size,parents', metadata);
    return drive.files.update({ fileId, fields, resource: metadata }).then(getdata);
  }

  x.updateMetadata = driveUpdateMetadata;

  function folderFrom(path) {
    const parts = path.split('/').filter((s) => (s.length > 0));
    const len = parts.length;
    const pre = (path.startsWith('/')) ? '/' : '';
    return pre + (parts.slice(0, len - 1).join('/'));
  }

  x.folderFrom = folderFrom;

  function nameFrom(path) {
    const parts = path.split('/').filter((s) => (s.length > 0));
    return parts[parts.length - 1];
  }

  x.nameFrom = nameFrom;

  // for url override see end of http://google.github.io/google-api-nodejs-client/22.2.0/index.html

  // legacy url: "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"

  function driveUploadDirector(parentFolderOrId) {
    const resumableUploadURL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable";
    return async function (metadata) {
      return (
        getFolderId(parentFolderOrId)
        .then((parent) => {
          const meta = Object.assign({}, metadata, { parents: [parent], spaces });
          return drive.files.create({
            uploadType: 'resumable',
            resource: meta,
            fields: 'id,name,mimeType,md5Checksum,parents'
          }, {
            url: resumableUploadURL
          }).then((response) => (response.headers.location));
        })
      );
    };
  }

  x.uploadDirector = driveUploadDirector;

  function streamToUrl(localStream, mimeType) {
    return async function (url) {
      const params = {
        sourceStream: localStream,
        mimeType,
        url,
        request
      };
      const result = await(upload(params));
      addNew(result);
      addIsFolder(result);
      return result;
    };
  }

x.streamToUrl = streamToUrl;

async function upload2({ folderPath, folderId, name, stream, mimeType, createPath, clobber }) {
  function requireString(v, l, k) {
    if ((typeof(v) !== 'string') || (v.length < l))
      throw new Error("drive.x.upload2, invalid parameter " + k + ", requires string of length at least " + l + " chars");
  }
  requireString(name, 1, 'name');
  requireString(mimeType, 1, 'mimeType');
  if (folderPath && folderId) throw Boom.badRequest("bad request, specify folderPath or folderId, not both");
  const findAll = driveSearcher({});
  const getFolder = (createPath) ? (driveCreatePath(folderPath)) : ((folderId && Promise.resolve(folderId)) || driveFindPath(folderPath));

  function go({ parent }) {
    if (parent === undefined) throw Boom.badImplementation("parent undefined");
    const pUploadUrl = driveUploadDirector(parent);
    return (
      pUploadUrl({ name, mimeType })
      .then(streamToUrl(stream, mimeType))
    );
  }

  const common = (getFolder
    .then(getFolderId)
    .then((parent) => (findAll(parent, name)))
  );

  if (clobber) {
    const janitor = driveJanitor('files');
    return (common
      .then(janitor)
      .then(go)
    );
  }

  return (common
    .then(({ parent, files }) => {
      if (files.length > 0)
        throw Boom.conflict('file exists');
      return go({ parent });
    })
  );
}


x.upload2 = upload2;

return x;
}

function decorate(drive, auth, request, salt) {
  // drive is delivered from googleapis frozen, so we'll refreeze after adding extensions
  const extras = {};
  extras.x = extensions(drive, request, 'root', 'drive', salt);
  if (auth) extras.x.auth = auth;
  extras.x.appDataFolder = extensions(drive, request, 'appDataFolder', 'appDataFolder', salt);
  return Object.freeze(Object.assign({}, drive, extras));
}

function decoratedGoogleDrive(googleapis, request, keys, tokens, salt) {
  if (!googleapis)
    throw Boom.badImplementation("googleapis not defined");
  if (!googleapis.auth)
    throw Boom.badImplementation("googleapis.auth not defined");
  if (!googleapis.auth.OAuth2)
    throw Boom.badImplementation("googleapis.auth.OAuth2 not defined");
  const OAuth2 = googleapis.auth.OAuth2;
  const auth = new OAuth2(keys.key, keys.secret, keys.redirect);
  // possible patch for googleapis 23.0.0 missing .setCredentials bug
  // see https://github.com/google/google-api-nodejs-client/issues/869
  // see https://github.com/google/google-auth-library-nodejs/issues/189
  if (typeof(auth.setCredentials) === 'function') {
    auth.setCredentials(tokens);
  } else {
    auth.credentials = tokens;
  }
  const drive = googleapis.drive({ version: 'v3', auth });
  if (typeof(drive) !== 'object')
    throw Boom.badImplementation("drive is not an object, got: " + typeof(drive));
  return decorate(drive, auth, request, salt);
}

decoratedGoogleDrive.decorate = decorate;
module.exports = decoratedGoogleDrive;
