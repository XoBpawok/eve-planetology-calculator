export function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function splitLines(text) {
  return text.split(/\r\n|\n/).filter((line) => line.length > 0);
}

function toNullableFloat(field) {
  if (field === undefined || field === '') return null;
  return parseFloat(field);
}

export function parseResources(csvText) {
  const lines = splitLines(csvText);
  const resources = new Map();
  for (const line of lines.slice(1)) {
    const [name, m3, avg, low, energy] = parseCsvLine(line);
    const trimmedName = name.trim();
    resources.set(trimmedName, {
      name: trimmedName,
      m3: parseFloat(m3),
      avg: toNullableFloat(avg),
      low: toNullableFloat(low),
      energy: toNullableFloat(energy),
    });
  }
  return resources;
}

export function parsePlanetRows(csvText) {
  const lines = splitLines(csvText);
  const rows = [];
  for (const line of lines.slice(1)) {
    const [planetId, region, constellation, system, planetName, planetType, resource, richness, output] =
      parseCsvLine(line);
    if (!planetId) continue;
    rows.push({
      planetId: planetId.trim(),
      region: region.trim(),
      constellation: constellation.trim(),
      system: system.trim(),
      planetName: planetName.trim(),
      planetType: planetType.trim(),
      resource: resource.trim(),
      richness: richness.trim(),
      output: parseFloat(output.replace(',', '.')),
    });
  }
  return rows;
}
