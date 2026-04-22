/**
 * 법제처 Open API JSON 응답을 XML 문자열로 변환.
 *
 * 배경: 법제처 XML 엔드포인트가 일부 쿼리에서 HTML 에러 페이지를 반환하는
 * 장애가 있어 LAW_RESPONSE_TYPE=JSON으로 우회. 기존 XML 파서 기반 도구들이
 * 그대로 동작하도록 JSON을 동등한 XML로 직렬화한다.
 *
 * 변환 규칙:
 * - 객체 키 → XML 태그명 (한글 태그 그대로 유지)
 * - 배열 → 같은 태그 반복 (법제처 XML 패턴과 일치, search.ts의 getElementsByTagName 호환)
 * - 원시값 → 텍스트 노드 (XML 특수문자 escape)
 * - 잘못된 입력 → 원본 그대로 반환 (안전한 fallback)
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function sanitizeTagName(name: string): string {
  // XML 이름 규칙: 첫 문자 letter/_, 이후 letter/digit/-_./. 한글은 letter category 포함.
  let cleaned = name.replace(/[^a-zA-Z0-9가-힣_:.-]/g, "_")
  if (!/^[a-zA-Z_가-힣]/.test(cleaned)) cleaned = "_" + cleaned
  return cleaned
}

function valueToXml(value: unknown, tagName: string): string {
  if (value === null || value === undefined) return `<${tagName}/>`
  if (Array.isArray(value)) return value.map(v => valueToXml(v, tagName)).join("")
  if (typeof value === "object") {
    const inner = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => valueToXml(v, sanitizeTagName(k)))
      .join("")
    return `<${tagName}>${inner}</${tagName}>`
  }
  return `<${tagName}>${escapeXml(String(value))}</${tagName}>`
}

export function jsonToXmlString(jsonText: string): string {
  let data: unknown
  try {
    data = JSON.parse(jsonText)
  } catch {
    return jsonText
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return jsonText
  const inner = Object.entries(data as Record<string, unknown>)
    .map(([k, v]) => valueToXml(v, sanitizeTagName(k)))
    .join("")
  return `<?xml version="1.0" encoding="UTF-8"?>${inner}`
}

export function looksLikeJson(text: string): boolean {
  return text.trim().startsWith("{")
}
