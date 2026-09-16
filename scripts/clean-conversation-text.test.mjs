import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyConversation, cleanConversationText, isOpenClawConversation } from './clean-conversation-text.mjs';

test('classifies OpenClaw runtime and workspace sessions', () => {
  assert.equal(isOpenClawConversation('OpenClaw runtime context for this turn: Current user request: OK'), true);
  assert.equal(isOpenClawConversation('hello', '/Users/me/.openclaw/workspace-bot'), true);
  assert.equal(isOpenClawConversation('OpenClaw 연결 문제 해결', '/Users/me/project'), false);
});

test('keeps only the actual user request from runtime context', () => {
  assert.equal(cleanConversationText('OpenClaw runtime context for this turn: hidden\nCurrent user request: Reply OK'), 'Reply OK');
});

test('classifies work topics with explicit priorities', () => {
  assert.equal(classifyConversation('최신 자료를 리서치해서 비교해줘'), 'research');
  assert.equal(classifyConversation('티스토리 TIL 포스팅 작성'), 'content');
  assert.equal(classifyConversation('이력서와 면접 답변 준비'), 'career');
  assert.equal(classifyConversation('데이터 분석 실습 문제'), 'learning');
  assert.equal(classifyConversation('Drive 폴더 문서 정리'), 'documentation');
  assert.equal(classifyConversation('Discord 미응답 원인 해결'), 'troubleshooting');
  assert.equal(classifyConversation('대시보드 API 구현'), 'development');
  assert.equal(classifyConversation('오늘 뭐하지'), 'other');
  assert.equal(classifyConversation('anything', true), 'openclaw');
});
