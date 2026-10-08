// Paste this file into a standalone Google Apps Script project owned by the
// Google account that should hold the backups. Set BACKUP_URL and
// BACKUP_EXPORT_SECRET in Project Settings > Script properties before running.

// The website decides whether a daily, weekly, or monthly backup is due.
// This trigger only polls the backend every 15 minutes.
function installBackupTrigger() {
  var properties = PropertiesService.getScriptProperties();
  backupConfiguration(properties);
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'backupToDrive') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('backupToDrive').timeBased().everyMinutes(15).create();
}

// Keep older setup instructions and existing user scripts working.
function installDailyBackupTrigger() { installBackupTrigger(); }

function backupConfiguration(properties) {
  var url = properties.getProperty('BACKUP_URL');
  var secret = properties.getProperty('BACKUP_EXPORT_SECRET');
  if (!/^https:\/\/[^/?#]+\/api\/backup\/scheduled$/.test(url || '')) {
    throw new Error('Set BACKUP_URL to the HTTPS backend /api/backup/scheduled URL.');
  }
  if (!secret || secret.length < 32) throw new Error('Set BACKUP_EXPORT_SECRET in Script properties.');
  return {url: url, secret: secret};
}

function backupHeader(response, name) {
  var headers = response.getAllHeaders();
  var key = Object.keys(headers).filter(function(header) {
    return header.toLowerCase() === name.toLowerCase();
  })[0];
  return key ? String(headers[key]) : '';
}

function backupFolder(properties, requestedId) {
  var id = requestedId || properties.getProperty('DRIVE_FOLDER_ID');
  if (id) return DriveApp.getFolderById(id);
  var folder = DriveApp.createFolder('Internet Business Backups');
  properties.setProperty('DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

function uploadBackup(force) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var properties = PropertiesService.getScriptProperties();
    var config = backupConfiguration(properties);
    var url = config.url + (force ? '?force=1' : '');
    var headers = {Authorization: 'Bearer ' + config.secret};
    var response = UrlFetchApp.fetch(url, {method: 'get', headers: headers, muteHttpExceptions: true});
    if (response.getResponseCode() === 204) return;
    if (response.getResponseCode() !== 200) {
      throw new Error('Backup download failed: HTTP ' + response.getResponseCode());
    }
    var filename = backupHeader(response, 'X-Backup-Filename');
    var date = backupHeader(response, 'X-Backup-Date');
    var requestedFolderId = backupHeader(response, 'X-Backup-Folder-Id');
    if (!/^internet-business-backup-\d{4}-\d{2}-\d{2}\.json\.enc$/.test(filename) ||
        filename !== 'internet-business-backup-' + date + '.json.enc') {
      throw new Error('Backup response did not include a valid filename and date.');
    }
    if (requestedFolderId && !/^[A-Za-z0-9_-]{10,200}$/.test(requestedFolderId)) {
      throw new Error('The site returned an invalid Google Drive folder ID.');
    }
    var folder = backupFolder(properties, requestedFolderId);
    var existing = folder.getFilesByName(filename);
    var file = existing.hasNext() ? existing.next() : folder.createFile(response.getBlob().setName(filename));
    var ack = UrlFetchApp.fetch(config.url + '/ack', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify({date: date, file_id: file.getId(), filename: filename, folder_id: folder.getId()}),
      muteHttpExceptions: true
    });
    if (ack.getResponseCode() !== 200) throw new Error('Backup confirmation failed: HTTP ' + ack.getResponseCode());
    properties.setProperty('LAST_SUCCESS_AT', new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

function backupToDrive() { uploadBackup(false); }

// Run once to verify the connection immediately; this counts as today's backup.
function runBackupNow() { uploadBackup(true); }
