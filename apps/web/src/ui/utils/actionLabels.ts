export function formatRecommendedAction(a: string): string {
  const normalized = String(a)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
  const map: Record<string, string> = {
    increase_ventilation: "Havalandırmayı artır (fan aç)",
    increase_humidity: "Nem artır (nemlendiriciyi aç)",
    decrease_humidity: "Nem düşür (havalandır / nemlendiriciyi kapat)",
    increase_temperature: "Sıcaklığı artır (ısıtıcıyı aç)",
    decrease_temperature: "Sıcaklığı düşür (havalandır / ısıtıcıyı kapat)",

    increase_lighting: "Aydınlatmayı artır",
    turn_on_lights: "Aydınlatmayı aç",
    lights_on: "Aydınlatmayı aç",

    increase_heating: "Isıtmayı artır",
    turn_on_heater: "Isıtıcıyı aç",
    heater_on: "Isıtıcıyı aç",

    turn_on_humidifier: "Nemlendiriciyi aç",
    humidifier_on: "Nemlendiriciyi aç"
  };

  return map[normalized] ?? a;
}

export function formatStressLevel(s: string): string {
  const key = String(s).trim().toLowerCase();
  const map: Record<string, string> = {
    normal: "Normal",
    ok: "Normal",
    low: "Düşük",
    medium: "Orta",
    high: "Yüksek",
    warning: "Uyarı",
    risk: "Risk",
    critical: "Kritik"
  };

  return map[key] ?? s;
}

export function formatRiskFlagKey(k: string): string {
  const map: Record<string, string> = {
    rapid_temp_change: "Ani sıcaklık değişimi",
    flacherie: "Flacherie riski",
    muscardine: "Muscardine / mantar riski",
    cocoon_quality: "Koza kalite riski"
  };

  return map[k] ?? k;
}

export function formatOverallStatus(s: string): string {
  const key = String(s).trim().toLowerCase();
  const map: Record<string, string> = {
    ok: "Normal",
    warning: "Uyarı",
    critical: "Kritik"
  };

  return map[key] ?? s;
}

export function formatStage(stage: string): string {
  const key = String(stage).trim().toLowerCase();
  const map: Record<string, string> = {
    egg: "Yumurta",
    egg_incubation: "Yumurta (Kuluçka)",
    incubation: "Kuluçka",
    adaptation: "Adaptasyon",
    larva_1: "Larva 1. dönem",
    larva_2: "Larva 2. dönem",
    larva_3: "Larva 3. dönem",
    larva_4: "Larva 4. dönem",
    larva_5: "Larva 5. dönem",
    cocoon: "Koza"
  };

  if (map[key]) return map[key];

  const larvaRange = /^larva_(\d)_(\d)$/i.exec(key);
  if (larvaRange) return `Larva ${larvaRange[1]}-${larvaRange[2]} geçişi`;

  return stage;
}

export function humanizeKeyOrText(t: string): string {
  const raw = String(t);
  const trimmed = raw.trim();
  if (!trimmed) return raw;

  const envStressMatch = /^environment\s+stress\s*:\s*(.+)$/i.exec(trimmed);
  if (envStressMatch) {
    const levelRaw = envStressMatch[1].trim();
    const levelKey = levelRaw.toLowerCase();
    const levelMap: Record<string, string> = {
      low: "Düşük",
      medium: "Orta",
      high: "Yüksek",
      critical: "Kritik",
      ok: "Normal",
      normal: "Normal",
      warning: "Uyarı",
      risk: "Risk"
    };
    const level = levelMap[levelKey] ?? levelRaw;
    return `Çevresel stres: ${level}`;
  }

  const key = trimmed.toLowerCase();
  const map: Record<string, string> = {
    device_offline: "Cihaz çevrimdışı",
    sensor_fault: "Sensör hatası",
    high_co2: "CO2 yüksek",
    low_temperature: "Sıcaklık düşük",
    high_temperature: "Sıcaklık yüksek",
    low_humidity: "Nem düşük",
    high_humidity: "Nem yüksek"
  };

  if (map[key]) return map[key];

  const actionText = formatRecommendedAction(trimmed);
  if (actionText !== trimmed) return actionText;

  if (/^[a-z0-9_\-]+$/i.test(trimmed) && (trimmed.includes("_") || trimmed.includes("-"))) {
    return trimmed.replace(/[_\-]+/g, " ");
  }

  return raw;
}
