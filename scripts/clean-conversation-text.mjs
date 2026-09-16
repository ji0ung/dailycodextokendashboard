const openClawPrefix = 'OpenClaw runtime context for this turn:';
const requestMarker = 'Current user request:';

export function isOpenClawConversation(firstUserText, cwd = '') {
  return /(?:^|\/)\.openclaw(?:\/|$)/.test(String(cwd))
    || String(firstUserText || '').trimStart().startsWith(openClawPrefix);
}

export function classifyConversation(value, isOpenClaw = false) {
  if (isOpenClaw) return 'openclaw';
  const text = cleanConversationText(value).toLowerCase();
  if (/(취업|채용|면접|이력서|경력|연봉|직업|회사 추천|서류 검토|지원자|자소서|포트폴리오)/.test(text)) return 'career';
  if (/(학습|공부|강의|교육|수업|실습|과제|데이터 ?분석|bi시각화|문제[- ]?\d|팀이 해야)/.test(text)) return 'learning';
  if (/(리서치|조사|찾아|비교|분석|아이디어|기획|전략|정보를 알려)/.test(text)) return 'research';
  if (/(블로그|til|글쓰기|콘텐츠|포스팅|티스토리)/.test(text)) return 'content';
  if (/(오류|에러|버그|문제 해결|원인|미응답|안 ?됨|실패|트러블슈팅|왜 ?이|안보여)/.test(text)) return 'troubleshooting';
  if (/(파일|폴더|문서|readme|drive|docs|ppt|docx|정리해|모아줘)/.test(text)) return 'documentation';
  if (/(코드|개발|구현|수정|만들|제작|repo|github|git\b|api\b|서버|대시보드|사이트|앱\b|크롤링|데이터베이스|프론트|백엔드|배포|openclaw|codex|vscode)/.test(text)) return 'development';
  return 'other';
}

export function cleanConversationText(value) {
  const text = String(value || '')
    .replace(/<recommended_plugins>[\s\S]*?<\/recommended_plugins>/g, '')
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/g, '')
    .trim();
  if (!text.startsWith(openClawPrefix)) return text;
  const marker = text.lastIndexOf(requestMarker);
  return marker < 0 ? '' : text.slice(marker + requestMarker.length).trim();
}

export function displayTitle(value) {
  const text = cleanConversationText(value).replace(/\s+/g, ' ');
  return text.length > 90 ? `${text.slice(0, 90)}...` : text || '제목 없는 Codex 작업';
}
