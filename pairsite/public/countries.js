/* TurboFex phone numbers: country list, number lengths and the checks that go with them.
   One file used by BOTH the page (live counter) and the server (the real check), so they can never disagree.
   Lengths are the national number WITHOUT the country code and WITHOUT the leading trunk 0 (ITU E.164 numbering plans, mobile-focused).
   For countries where the exact rule is not known here the range is wider and marked "loose"; the server additionally uses the
   libphonenumber-js library when it is installed (see phone.js). Nothing here can say whether a number HAS WhatsApp - only WhatsApp can. */
(function (root) {
  // ISO | name | dial code | min | max | optional pattern the first digits must match
  var RAW = [
    'NG|Nigeria|234|10|10|[789]', 'GH|Ghana|233|9|9|[235]', 'ZA|South Africa|27|9|9|[1-8]', 'KE|Kenya|254|9|9|[17]', 'UG|Uganda|256|9|9|[37]', 'TZ|Tanzania|255|9|9|[67]',
    'ET|Ethiopia|251|9|9|[79]', 'RW|Rwanda|250|9|9|7', 'ZM|Zambia|260|9|9|[79]', 'ZW|Zimbabwe|263|9|10|7', 'MW|Malawi|265|7|9', 'CM|Cameroon|237|9|9|[62]', 'CI|Côte d’Ivoire|225|8|10',
    'SN|Senegal|221|9|9|7', 'ML|Mali|223|8|8', 'BF|Burkina Faso|226|8|8', 'NE|Niger|227|8|8', 'TG|Togo|228|8|8', 'BJ|Benin|229|8|10', 'GM|Gambia|220|7|7', 'SL|Sierra Leone|232|8|8',
    'LR|Liberia|231|7|9', 'GN|Guinea|224|9|9', 'GW|Guinea-Bissau|245|7|9', 'CV|Cabo Verde|238|7|7', 'MR|Mauritania|222|8|8', 'AO|Angola|244|9|9|9', 'MZ|Mozambique|258|9|9|8', 'NA|Namibia|264|8|10',
    'BW|Botswana|267|7|8', 'LS|Lesotho|266|8|8', 'SZ|Eswatini|268|8|8', 'MG|Madagascar|261|9|9|3', 'MU|Mauritius|230|7|8', 'SC|Seychelles|248|7|7', 'KM|Comoros|269|7|7', 'DJ|Djibouti|253|8|8',
    'SO|Somalia|252|7|9', 'ER|Eritrea|291|7|7', 'SD|Sudan|249|9|9', 'SS|South Sudan|211|9|9', 'CD|DR Congo|243|9|9', 'CG|Congo|242|9|9', 'GA|Gabon|241|7|8', 'GQ|Equatorial Guinea|240|9|9',
    'TD|Chad|235|8|8', 'CF|Central African Republic|236|8|8', 'BI|Burundi|257|8|8', 'ST|São Tomé and Príncipe|239|7|7', 'EG|Egypt|20|10|10|1', 'MA|Morocco|212|9|9|[567]', 'DZ|Algeria|213|9|9|[567]',
    'TN|Tunisia|216|8|8', 'LY|Libya|218|9|9', 'RE|Réunion|262|9|9', 'YT|Mayotte|262|9|9',
    'US|United States|1|10|10|NANP', 'CA|Canada|1|10|10|NANP', 'PR|Puerto Rico|1|10|10|NANP', 'JM|Jamaica|1|10|10|NANP', 'DO|Dominican Republic|1|10|10|NANP', 'TT|Trinidad and Tobago|1|10|10|NANP',
    'BS|Bahamas|1|10|10|NANP', 'BB|Barbados|1|10|10|NANP', 'BM|Bermuda|1|10|10|NANP', 'KY|Cayman Islands|1|10|10|NANP', 'GU|Guam|1|10|10|NANP', 'VI|US Virgin Islands|1|10|10|NANP', 'AG|Antigua and Barbuda|1|10|10|NANP',
    'LC|Saint Lucia|1|10|10|NANP', 'GD|Grenada|1|10|10|NANP', 'VC|Saint Vincent and the Grenadines|1|10|10|NANP', 'KN|Saint Kitts and Nevis|1|10|10|NANP', 'DM|Dominica|1|10|10|NANP',
    'MX|Mexico|52|10|10', 'BR|Brazil|55|10|11', 'AR|Argentina|54|10|11', 'CO|Colombia|57|10|10|3', 'CL|Chile|56|9|9', 'PE|Peru|51|9|9|9', 'VE|Venezuela|58|10|10', 'EC|Ecuador|593|9|9', 'BO|Bolivia|591|8|8',
    'PY|Paraguay|595|9|9', 'UY|Uruguay|598|8|9', 'GT|Guatemala|502|8|8', 'HN|Honduras|504|8|8', 'SV|El Salvador|503|8|8', 'NI|Nicaragua|505|8|8', 'CR|Costa Rica|506|8|8', 'PA|Panama|507|8|8',
    'CU|Cuba|53|8|8', 'HT|Haiti|509|8|8', 'GY|Guyana|592|7|7', 'SR|Suriname|597|6|7', 'BZ|Belize|501|7|7',
    'GB|United Kingdom|44|9|10', 'IE|Ireland|353|7|9', 'FR|France|33|9|9|[1-9]', 'DE|Germany|49|10|11', 'ES|Spain|34|9|9|[5-9]', 'IT|Italy|39|9|10', 'NL|Netherlands|31|9|9', 'BE|Belgium|32|8|9',
    'PT|Portugal|351|9|9', 'CH|Switzerland|41|9|9', 'AT|Austria|43|10|13', 'SE|Sweden|46|7|9', 'NO|Norway|47|8|8', 'DK|Denmark|45|8|8', 'FI|Finland|358|7|10', 'IS|Iceland|354|7|7', 'LU|Luxembourg|352|8|9',
    'MT|Malta|356|8|8', 'CY|Cyprus|357|8|8', 'GR|Greece|30|10|10', 'PL|Poland|48|9|9', 'CZ|Czechia|420|9|9', 'SK|Slovakia|421|9|9', 'HU|Hungary|36|8|9', 'RO|Romania|40|9|9', 'BG|Bulgaria|359|8|9',
    'RS|Serbia|381|8|9', 'HR|Croatia|385|8|9', 'SI|Slovenia|386|8|8', 'BA|Bosnia and Herzegovina|387|8|8', 'ME|Montenegro|382|8|8', 'MK|North Macedonia|389|8|8', 'AL|Albania|355|8|9', 'XK|Kosovo|383|8|9',
    'LT|Lithuania|370|8|8', 'LV|Latvia|371|8|8', 'EE|Estonia|372|7|8', 'BY|Belarus|375|9|9', 'UA|Ukraine|380|9|9', 'MD|Moldova|373|8|8', 'RU|Russia|7|10|10|[3-9]', 'KZ|Kazakhstan|7|10|10|[67]',
    'GE|Georgia|995|9|9', 'AM|Armenia|374|8|8', 'AZ|Azerbaijan|994|9|9', 'TR|Türkiye|90|10|10|[1-9]', 'UZ|Uzbekistan|998|9|9', 'TM|Turkmenistan|993|8|8', 'KG|Kyrgyzstan|996|9|9', 'TJ|Tajikistan|992|9|9',
    'IN|India|91|10|10|[6-9]', 'PK|Pakistan|92|10|10|3', 'BD|Bangladesh|880|10|10|1', 'LK|Sri Lanka|94|9|9|7', 'NP|Nepal|977|10|10|9', 'BT|Bhutan|975|8|8', 'MV|Maldives|960|7|7', 'AF|Afghanistan|93|9|9|7',
    'CN|China|86|11|11|1', 'HK|Hong Kong|852|8|8', 'MO|Macao|853|8|8', 'TW|Taiwan|886|9|9|9', 'JP|Japan|81|10|10', 'KR|South Korea|82|9|10', 'MN|Mongolia|976|8|8',
    'SG|Singapore|65|8|8|[89]', 'MY|Malaysia|60|9|10|1', 'ID|Indonesia|62|9|12|8', 'TH|Thailand|66|9|9|[689]', 'VN|Vietnam|84|9|9', 'PH|Philippines|63|10|10|9', 'KH|Cambodia|855|8|9', 'LA|Laos|856|8|10',
    'MM|Myanmar|95|8|10', 'BN|Brunei|673|7|7', 'TL|Timor-Leste|670|7|8',
    'SA|Saudi Arabia|966|9|9|5', 'AE|United Arab Emirates|971|9|9|5', 'QA|Qatar|974|8|8', 'KW|Kuwait|965|8|8', 'BH|Bahrain|973|8|8', 'OM|Oman|968|8|8', 'JO|Jordan|962|9|9|7', 'LB|Lebanon|961|7|8',
    'IQ|Iraq|964|10|10|7', 'IR|Iran|98|10|10|9', 'IL|Israel|972|9|9|5', 'PS|Palestine|970|9|9', 'SY|Syria|963|9|9', 'YE|Yemen|967|9|9',
    'AU|Australia|61|9|9|4', 'NZ|New Zealand|64|8|10|2', 'FJ|Fiji|679|7|7', 'PG|Papua New Guinea|675|7|8', 'WS|Samoa|685|7|7', 'TO|Tonga|676|5|7', 'VU|Vanuatu|678|7|7', 'SB|Solomon Islands|677|7|7', 'NC|New Caledonia|687|6|6', 'PF|French Polynesia|689|8|8'
  ];
  var NANP_REST = '^[2-9]\\d\\d[2-9]\\d{6}$';
  var COUNTRIES = RAW.map(function (s) {
    var p = s.split('|'), o = { iso: p[0], name: p[1], dial: p[2], min: +p[3], max: +p[4], start: p[5] || '' };
    return o;
  });
  var known = {}; COUNTRIES.forEach(function (c) { known[c.iso] = c; });
  function byIso(iso) { return known[String(iso || '').toUpperCase()] || null; }
  function flag(iso) { iso = String(iso || '').toUpperCase(); if (!/^[A-Z]{2}$/.test(iso)) return ''; return String.fromCodePoint(127397 + iso.charCodeAt(0), 127397 + iso.charCodeAt(1)); }
  function startsOk(c, nat) {
    if (c.start === 'NANP') return new RegExp(NANP_REST).test(nat) || (nat.length < 10 && /^[2-9]/.test(nat) && (nat.length < 4 || /[2-9]/.test(nat.charAt(3))));
    if (!c.start) return true;
    return new RegExp('^(?:' + c.start + ')').test(nat);
  }
  // sorted longest dial code first, so "+1242..." and "+7..." find the right prefix
  var byLen = COUNTRIES.slice().sort(function (a, b) { return b.dial.length - a.dial.length; });
  function dialsIn(digits) { var seen = {}, out = []; byLen.forEach(function (c) { if (digits.indexOf(c.dial) === 0 && !seen[c.dial]) { seen[c.dial] = 1; out.push(c.dial); } }); return out; }

  /* analyze(raw, iso): what the person typed + the chosen country  ->  how far along the number is.
     raw may be just the national number ("801 234 5678", "0801 234 5678") or a full international number ("+234 801 234 5678", "00234...", "234801...").
     state: empty | incomplete | valid | toolong | invalid */
  function analyze(raw, iso) {
    var c = byIso(iso), text = String(raw == null ? '' : raw).trim(), international = /^\+/.test(text) || /^00/.test(text);
    var d = text.replace(/\D/g, ''); if (/^00/.test(text.replace(/[^\d+]/g, ''))) d = d.replace(/^00/, '');
    var res = { state: 'empty', iso: c ? c.iso : '', dial: c ? c.dial : '', national: '', e164: '', min: c ? c.min : 0, max: c ? c.max : 0, remaining: 0, message: '', countryChanged: '' };
    if (!d) return res;
    // international input for ANOTHER country code than the selected one: switch to the country that owns that code
    if (international || !c) {
      var prefix = dialsIn(d)[0];
      if (!prefix) { res.state = 'invalid'; res.message = 'The country code is not recognised. Choose your country.'; return res; }
      if (!c || c.dial !== prefix) {
        var alt = byLen.filter(function (x) { return x.dial === prefix; });
        var pick = alt.filter(function (x) { return startsOk(x, d.slice(prefix.length).replace(/^0+/, '')) && d.slice(prefix.length).replace(/^0+/, '').length >= x.min && d.slice(prefix.length).replace(/^0+/, '').length <= x.max; })[0] || alt[0];
        if (!c && !international) { /* no country chosen and not international: try to read the country code from the digits */ }
        c = pick; res.countryChanged = c.iso; res.iso = c.iso; res.dial = c.dial; res.min = c.min; res.max = c.max;
      }
      d = d.slice(c.dial.length);
    } else {
      // national input: drop a country code the person typed again by mistake (234 801... when 234 is already selected), then trunk zeros
      var t = d.replace(/^0+/, '');
      if (t.indexOf(c.dial) === 0 && t.length > c.max && t.length - c.dial.length >= c.min) t = t.slice(c.dial.length);
      else if (t.indexOf(c.dial) === 0 && t.length === c.max + c.dial.length) t = t.slice(c.dial.length);
      d = t;
    }
    var nat = d.replace(/^0+/, '');
    // a country code typed twice ("234234801...") after an international prefix
    if (nat.indexOf(c.dial) === 0 && nat.length === c.max + c.dial.length) nat = nat.slice(c.dial.length);
    res.national = nat;
    if (!nat) { res.state = 'empty'; res.remaining = c.min; return res; }
    if (nat.length > c.max) { res.state = 'toolong'; res.remaining = nat.length - c.max; res.message = 'Too long: ' + res.remaining + ' digit' + (res.remaining > 1 ? 's' : '') + ' too many for ' + c.name + '.'; return res; }
    if (!startsOk(c, nat)) { res.state = nat.length < c.min ? 'incomplete' : 'invalid'; res.remaining = Math.max(0, c.min - nat.length); res.message = nat.length < c.min ? '' : 'This does not look like a ' + c.name + ' mobile number.'; if (res.state === 'incomplete') { /* still typing: only complain once the first digits cannot match */ if (nat.length >= 1 && !startsOk(c, nat)) { res.state = 'invalid'; res.message = 'A ' + c.name + ' mobile number does not start like this.'; } } return res; }
    if (nat.length < c.min) { res.state = 'incomplete'; res.remaining = c.min - nat.length; return res; }
    res.state = 'valid'; res.e164 = c.dial + nat; res.remaining = 0; return res;
  }
  var api = { COUNTRIES: COUNTRIES, byIso: byIso, flag: flag, analyze: analyze, NANP_REST: NANP_REST };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TFX_PHONE = api;
})(typeof window !== 'undefined' ? window : this);
