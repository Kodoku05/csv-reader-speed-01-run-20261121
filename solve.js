/** Fast, dependency-free implementation of the csv-reader 1.0.0 contract. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Append a successful quoted payload, decoding doubled quotes and newline-normalizing CRs.
  function quotedValue(start, end) {
    let out = '';
    let part = start;
    for (let i = start; i < end; i++) {
      const c = text.charCodeAt(i);
      if (c === 34) {
        if (i > part) out += text.slice(part, i);
        out += '"';
        i++;
        part = i + 1;
      } else if (c === 13) {
        if (i > part) out += text.slice(part, i);
        out += '\n';
        line++;
        if (text.charCodeAt(i + 1) === 10) i++;
        part = i + 1;
      } else if (c === 10) {
        line++;
      }
    }
    if (end > part) out += text.slice(part, end);
    return out;
  }

  // Scan an unquoted span to its delimiter. The usual path slices once and performs no per-character JS work.
  function unquoted(initial = '') {
    let start = pos;
    let value = initial;
    let added = 0;
    while (pos < text.length) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      const cr = text.indexOf('\r', pos);
      let next = text.length;
      if (comma !== -1 && comma < next) next = comma;
      if (lf !== -1 && lf < next) next = lf;
      if (cr !== -1 && cr < next) next = cr;
      if (next > start) {
        value += text.slice(start, next);
        added += next - start;
      }
      pos = next;
      if (pos === text.length) return { value, ended: 2, added };
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos++;
        return { value, ended: 0, added };
      }
      if (c === 10) {
        pos++;
        line++;
        return { value, ended: 1, added };
      }
      if (text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
        return { value, ended: 1, added };
      }
      error('stray_cr');
      pos++;
      start = pos;
    }
    return { value, ended: 2, added };
  }

  // A field starting with a quote. If no closing quote exists, rewind and parse it as unquoted text.
  function quoted() {
    const open = pos;
    pos++;
    let scan = pos;
    let closedAt = -1;
    while (true) {
      const q = text.indexOf('"', scan);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        scan = q + 2;
      } else {
        closedAt = q;
        break;
      }
    }
    if (closedAt === -1) {
      pos = open;
      error('unterminated_quote');
      return unquoted('');
    }
    const value = quotedValue(open + 1, closedAt);
    pos = closedAt + 1;
    if (pos >= text.length) return { value, ended: 2 };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos++;
      return { value, ended: 0 };
    }
    if (c === 10) {
      pos++;
      line++;
      return { value, ended: 1 };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line++;
      return { value, ended: 1 };
    }
    const junk = unquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  while (true) {
    // Skip empty LF/CRLF lines. A lone CR is left for the unquoted scanner to report.
    while (pos < text.length) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos++;
        line++;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= text.length) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      const field = lastQuoted ? quoted() : unquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === 0);

    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
