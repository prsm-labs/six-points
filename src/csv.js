// Minimal CSV parser for the pipeline's own CSVs (no quoted commas in them). Splits on \r?\n --
// pandas.to_csv() writes \r\n on Windows (the trailing-\r Track Record bug, CLAUDE.md "Known Bugs").
export function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split(/\r?\n/)
  const headers = headerLine.split(',')
  return lines.map((line) => {
    const values = line.split(',')
    const row = {}
    headers.forEach((h, i) => {
      row[h] = values[i]
    })
    return row
  })
}
