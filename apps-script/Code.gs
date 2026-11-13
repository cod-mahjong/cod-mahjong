/** @OnlyCurrentDoc  — 이 시트 하나에만 접근 권한을 요청하도록 제한 */

/**
 * 동아리 마작 대회 — 사이트에서 기록 추가/삭제를 하기 위한 Apps Script
 *
 * 설치: 구글 시트 → 확장 프로그램 → Apps Script → 이 코드를 통째로 붙여넣기
 *       → 아래 ADMIN_PASSWORD 바꾸기 → 배포 → 새 배포 → 웹 앱
 *       (실행 사용자: 나 / 액세스 권한: 모든 사용자) → 나온 URL을 config.js 의 adminApiUrl 에 넣기
 *
 * 시트 양식: A 날짜 | B 동 | C 동 점수 | D 남 | E 남 점수 | F 서 | G 서 점수 | H 북 | I 북 점수
 */

const ADMIN_PASSWORD = '여기에-운영자-비밀번호'; // ← 꼭 바꾸세요
const SHEET_NAME = ''; // 비워두면 첫 번째 시트를 사용

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    lock.waitLock(10000);
    locked = true;
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (String(req.password || '') !== ADMIN_PASSWORD) {
      return out({ ok: false, error: '비밀번호가 틀렸어요.' });
    }
    const sheet = getSheet_();
    switch (req.action) {
      case 'check':
        return out({ ok: true });
      case 'add':
        return out(addGame_(sheet, req));
      case 'delete':
        return out(deleteGame_(sheet, req));
      default:
        return out({ ok: false, error: '알 수 없는 요청이에요.' });
    }
  } catch (err) {
    return out({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

// 배포 주소를 브라우저로 열었을 때 동작 확인용
function doGet() {
  return out({ ok: true, message: '마작 대회 기록 API가 동작 중이에요.' });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) throw new Error('시트를 찾지 못했어요. SHEET_NAME을 확인하세요.');
  return sheet;
}

function cleanPlayers_(players) {
  if (!Array.isArray(players) || players.length !== 4) throw new Error('선수 4명의 기록이 필요해요.');
  return players.map(function (p) {
    const name = String(p && p.name || '').trim();
    const score = Number(String(p && p.score).replace(/[,\s]/g, ''));
    if (!name) throw new Error('이름이 비어 있어요.');
    if (!isFinite(score)) throw new Error(name + ' 점수가 숫자가 아니에요.');
    return { name: name, score: score };
  });
}

/** 이름:점수|이름:점수|… — 사이트와 같은 규칙으로 한 판을 식별 */
function fingerprint_(players) {
  return players.map(function (p) { return p.name + ':' + p.score; }).join('|');
}

function rowFingerprint_(row) {
  const players = [];
  for (let s = 0; s < 4; s++) {
    const name = String(row[1 + s * 2] || '').trim();
    const score = Number(String(row[2 + s * 2]).replace(/[,\s]/g, ''));
    if (!name || String(row[2 + s * 2]).trim() === '' || !isFinite(score)) return null;
    players.push({ name: name, score: score });
  }
  return fingerprint_(players);
}

function addGame_(sheet, req) {
  const players = cleanPlayers_(req.players);
  const names = players.map(function (p) { return p.name; });
  if (new Set(names).size !== 4) throw new Error('같은 선수가 두 번 들어가 있어요.');
  const date = String(req.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜 형식이 올바르지 않아요.');
  const row = [date];
  players.forEach(function (p) { row.push(p.name, p.score); });
  sheet.appendRow(row);
  return { ok: true, row: sheet.getLastRow() };
}

function deleteGame_(sheet, req) {
  const fp = fingerprint_(cleanPlayers_(req.players));
  const values = sheet.getDataRange().getValues();
  const wanted = Number(req.row) || 0;

  // 같은 기록을 가진 줄 중에서, 사이트가 알려준 줄 번호와 가장 가까운 줄을 지움
  // (사이트가 조금 늦게 반영돼서 줄 번호가 밀렸어도 올바른 줄을 찾도록)
  let target = -1;
  for (let i = 0; i < values.length; i++) {
    if (rowFingerprint_(values[i]) !== fp) continue;
    if (target < 0 || Math.abs(i + 1 - wanted) < Math.abs(target - wanted)) target = i + 1;
  }
  if (target < 0) throw new Error('시트에서 해당 기록을 찾지 못했어요. 이미 삭제됐을 수 있어요.');

  // 지우는 줄에 날짜가 있고 바로 아랫줄 날짜가 비어 있으면, 날짜를 아랫줄로 옮겨줌
  const dateCell = values[target - 1][0];
  const next = values[target]; // 다음 줄 (0-based 인덱스 = target)
  if (dateCell !== '' && next && next[0] === '' && next.slice(1).some(function (v) { return v !== ''; })) {
    sheet.getRange(target + 1, 1).setValue(dateCell);
  }
  sheet.deleteRow(target);
  return { ok: true, row: target };
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
