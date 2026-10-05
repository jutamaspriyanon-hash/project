const DATA_URL = "Online_Retail_Cleaned_Final-1.csv";

let globalDataset = [];
let filteredData = [];

// Global State Filters
let selectedCountry = 'ALL';
let selectedType = 'ALL';
let selectedYear = 'ALL';
let selectedMonth = 'ALL';
let localProductMetric = 'value';
let localProductTop = 10;
let localDonutTop = 5;
let localScatterPrice = 'all';
let localScatterQty = 0;

// Fixed, deterministic country colors. A country keeps the same color across filters.
const COUNTRY_COLOR_MAP = {};
const COUNTRY_HUE_STEP = 137.508; // golden-angle spacing for distinct categorical colors
function getCountryColor(country) {
  if (!COUNTRY_COLOR_MAP[country]) {
    const index = Object.keys(COUNTRY_COLOR_MAP).length;
    const hue = (index * COUNTRY_HUE_STEP) % 360;
    COUNTRY_COLOR_MAP[country] = `hsl(${hue.toFixed(1)}, 68%, 48%)`;
  }
  return COUNTRY_COLOR_MAP[country];
}

const TYPE_COLORS = {
  'Sale': '#10b981',
  'Return/Cancelled': '#ef4444'
};

const BAR_COLORS = [
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#f97316', '#eab308', '#10b981'
];

document.addEventListener('DOMContentLoaded', () => {
  loadData();

  d3.select('#countryFilter').on('change', function() {
    selectedCountry = this.value;
    applyFilters();
  });

  d3.select('#typeFilter').on('change', function() {
    selectedType = this.value;
    applyFilters();
  });

  d3.select('#yearFilter').on('change', function() {
    selectedYear = this.value;
    selectedMonth = 'ALL';
    populateMonthDropdown();
    d3.select('#monthFilter').property('value', 'ALL');
    applyFilters();
  });

  d3.select('#monthFilter').on('change', function() {
    selectedMonth = this.value;
    applyFilters();
  });

  d3.select('#localProductMetric').on('change', function() { localProductMetric = this.value; renderBarChart(); });
  d3.select('#localProductTop').on('change', function() { localProductTop = +this.value; renderBarChart(); });
  d3.select('#localDonutTop').on('change', function() { localDonutTop = +this.value; renderDonutChart(); });
  d3.select('#localScatterPrice').on('change', function() { localScatterPrice = this.value; renderScatterChart(); });
  d3.select('#localScatterQty').on('change', function() { localScatterQty = +this.value; renderScatterChart(); });

  d3.select('#resetBtn').on('click', resetDashboard);

  window.addEventListener('resize', renderCharts);
});

function loadData() {
  // Normal mode: load the CSV file next to this dashboard.
  // Local-file fallback: use the embedded copy so charts still work when
  // index.html is opened directly with file:// and the browser blocks d3.csv().
  const loadRows = rows => {
    globalDataset = rows.map(d => {
      const date = parseInvoiceDate(d.InvoiceDate);
      return {
        Description: d.Description || 'Uncategorized',
        Quantity: +d.Quantity || 0,
        UnitPrice: +d.UnitPrice || 0,
        CustomerID: d.CustomerID,
        Country: d.Country,
        TransactionType: d.TransactionType,
        LineAmount: +d.LineAmount || (+d.Quantity * +d.UnitPrice),
        InvoiceDate: d.InvoiceDate || '',
        Date: date,
        Year: date?.getFullYear() ?? null,
        Month: date ? date.getMonth() + 1 : null
      };
    }).filter(d => d.Date instanceof Date && !Number.isNaN(d.Date.getTime()));

    filteredData = [...globalDataset];
    populateCountryDropdown();
    populateYearDropdown();
    populateMonthDropdown();
    updateDashboard();
  };

  d3.csv(DATA_URL).then(loadRows).catch(err => {
    console.warn('CSV fetch was blocked or unavailable. Using embedded dashboard data instead.', err);
    if (typeof window.EMBEDDED_ONLINE_RETAIL_CSV === 'string') {
      loadRows(d3.csvParse(window.EMBEDDED_ONLINE_RETAIL_CSV));
    } else {
      console.error('No embedded data is available.', err);
    }
  });
}


function parseInvoiceDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const withAmPm = d3.timeParse('%m/%d/%Y %I:%M:%S %p')(raw)
    || d3.timeParse('%m/%d/%Y %I:%M %p')(raw);
  if (withAmPm) return withAmPm;
  return d3.timeParse('%m/%d/%Y %H:%M:%S')(raw)
    || d3.timeParse('%m/%d/%Y %H:%M')(raw);
}

const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

function populateYearDropdown() {
  const years = Array.from(new Set(globalDataset.map(d => d.Year).filter(Boolean))).sort((a,b) => a-b);
  const select = d3.select('#yearFilter');
  select.selectAll('option:not(:first-child)').remove();
  years.forEach(y => select.append('option').attr('value', y).text(y));
}

function populateMonthDropdown() {
  const availableMonths = Array.from(new Set(
    globalDataset
      .filter(d => selectedYear === 'ALL' || String(d.Year) === String(selectedYear))
      .map(d => d.Month)
      .filter(Boolean)
  )).sort((a,b) => a-b);

  const select = d3.select('#monthFilter');
  select.selectAll('option:not(:first-child)').remove();
  availableMonths.forEach(m => {
    select.append('option').attr('value', m).text(`${String(m).padStart(2,'0')} - ${MONTH_NAMES_TH[m - 1]}`);
  });

  if (selectedMonth !== 'ALL' && !availableMonths.includes(+selectedMonth)) {
    selectedMonth = 'ALL';
  }
  select.property('value', selectedMonth);
}

function populateCountryDropdown() {
  const countries = Array.from(new Set(globalDataset.map(d => d.Country))).sort();
  const select = d3.select('#countryFilter');
  countries.forEach(c => select.append('option').attr('value', c).text(c));
}

function applyFilters() {
  filteredData = globalDataset.filter(d => {
    const matchCountry = selectedCountry === 'ALL' || d.Country === selectedCountry;
    const matchType = selectedType === 'ALL' || d.TransactionType === selectedType;
    const matchYear = selectedYear === 'ALL' || String(d.Year) === String(selectedYear);
    const matchMonth = selectedMonth === 'ALL' || String(d.Month) === String(selectedMonth);
    return matchCountry && matchType && matchYear && matchMonth;
  });
  updateDashboard();
}

function resetDashboard() {
  selectedCountry = 'ALL';
  selectedType = 'ALL';
  selectedYear = 'ALL';
  selectedMonth = 'ALL';
  localProductMetric = 'value';
  localProductTop = 10;
  localDonutTop = 5;
  localScatterPrice = 'all';
  localScatterQty = 0;

  d3.select('#localProductMetric').property('value', 'value');
  d3.select('#localProductTop').property('value', '10');
  d3.select('#localDonutTop').property('value', '5');
  d3.select('#localScatterPrice').property('value', 'all');
  d3.select('#localScatterQty').property('value', '0');
  d3.select('#countryFilter').property('value', 'ALL');
  d3.select('#typeFilter').property('value', 'ALL');
  d3.select('#yearFilter').property('value', 'ALL');
  populateMonthDropdown();
  d3.select('#monthFilter').property('value', 'ALL');

  filteredData = [...globalDataset];
  updateDashboard();
}

function updateDashboard() {
  renderKPIs();
  renderCharts();
}

function renderKPIs() {
  const totalSales = d3.sum(filteredData, d => d.LineAmount);
  const totalQty = d3.sum(filteredData, d => d.Quantity);
  const totalOrders = filteredData.length;
  const uniqueCountries = new Set(filteredData.map(d => d.Country)).size;

  d3.select('#kpiTotalSales').text(`£${d3.format(",.2f")(totalSales)}`);
  d3.select('#kpiTotalQty').text(`${d3.format(",")(totalQty)} ชิ้น`);
  d3.select('#kpiTotalOrders').text(`${d3.format(",")(totalOrders)} รายการ`);
  d3.select('#kpiTotalCountries').text(`${uniqueCountries} ประเทศ`);
}

function renderCharts() {
  renderBarChart();
  renderDonutChart();
  renderColumnChart();
  renderScatterChart();
}

const tooltip = d3.select("#tooltip");

function showTooltip(event, content) {
  tooltip.html(content)
    .style("opacity", 1)
    .style("left", (event.pageX + 15) + "px")
    .style("top", (event.pageY - 28) + "px");
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

// 1. Bar Chart (แก้อาการสีซ้อนด้วย container.html(""))
function renderBarChart() {
  const container = d3.select("#barChart");
  container.html(""); // ล้าง Element เก่าทั้งหมด

  const bounds = container.node().getBoundingClientRect();
  const margin = { top: 12, right: 30, bottom: 48, left: 190 };
  const width = bounds.width - margin.left - margin.right;
  const height = bounds.height - margin.top - margin.bottom;

  // กราฟนี้ใช้ตัวกรองหลักทั้งหมด แล้วมีตัวกรองเฉพาะกราฟเป็น 'ตัวชี้วัด' และจำนวนอันดับ
  const dataset = filteredData;

  const productData = Array.from(
    d3.rollup(dataset, v => ({
      Sales: d3.sum(v, d => d.LineAmount),
      Qty: d3.sum(v, d => d.Quantity)
    }), d => d.Description),
    ([Description, stats]) => ({
      ShortDesc: Description.length > 22 ? Description.substring(0, 20) + '...' : Description,
      FullDesc: Description,
      ...stats
    })
  ).sort((a, b) => localProductMetric === 'qty' ? b.Qty - a.Qty : b.Sales - a.Sales).slice(0, localProductTop);

  // Prevent bars from sharing the same y-position when long product names
  // have identical first 20 characters.
  const labelCounts = new Map();
  productData.forEach(d => {
    const base = d.ShortDesc;
    const count = (labelCounts.get(base) || 0) + 1;
    labelCounts.set(base, count);
    if (count > 1) d.ShortDesc = `${base} #${count}`;
  });

  const svg = container.append("svg")
    .attr("width", bounds.width)
    .attr("height", bounds.height)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const y = d3.scaleBand().range([0, height]).domain(productData.map(d => d.ShortDesc)).padding(0.25);
  const metricMax = d3.max(productData, d => localProductMetric === 'qty' ? d.Qty : d.Sales) || 100;
  const x = d3.scaleLinear().domain([0, metricMax * 1.1]).range([0, width]);

  svg.append("g").call(d3.axisLeft(y));
  svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => localProductMetric === 'qty' ? d3.format(',')(d) : `£${d/1000}k`));

  // Axes Labels
  svg.append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 38)
    .attr("text-anchor", "middle")
    .text(localProductMetric === 'qty' ? 'จำนวนชิ้น' : 'มูลค่ารายการ (£)');

  svg.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -160)
    .attr("text-anchor", "middle")
    .text("รายชื่อสินค้า (Top 10)");

  svg.selectAll(".bar-rect")
    .data(productData)
    .enter()
    .append("rect")
    .attr("class", "bar-rect")
    .attr("y", d => y(d.ShortDesc))
    .attr("height", y.bandwidth())
    .attr("fill", (d, i) => BAR_COLORS[i % BAR_COLORS.length])
    .attr("rx", 4)
    .attr("x", 0)
    .attr("width", 0)
    .transition().duration(700).delay((d,i) => i * 45).ease(d3.easeCubicOut)
    .attr("width", d => x(localProductMetric === 'qty' ? d.Qty : d.Sales))
    .selection()
    .on("mouseover", (e, d) => showTooltip(e, `<b>${d.FullDesc}</b><br/>ยอดขาย: £${d3.format(",.2f")(d.Sales)}<br/>จำนวน: ${d3.format(",")(d.Qty)} ชิ้น`))
    .on("mouseout", hideTooltip);
}

// 2. Donut Chart — Country Share
function renderDonutChart() {
  const container = d3.select("#donutChart");
  container.html("");

  const bounds = container.node().getBoundingClientRect();
  const width = bounds.width;
  const height = bounds.height;
  const donutWidth = Math.min(width * 0.62, 430);
  const radius = Math.min(donutWidth * 0.38, height * 0.40);

  const donutDataset = filteredData;
  const totalValue = d3.sum(donutDataset, d => d.LineAmount);

  const countryRollup = Array.from(
    d3.rollup(donutDataset, v => ({
      Value: d3.sum(v, d => d.LineAmount),
      Count: v.length
    }), d => d.Country),
    ([Country, stats]) => ({ Country, ...stats })
  ).sort((a, b) => b.Value - a.Value);

  // Register colors before slicing so every country keeps the same color.
  countryRollup.forEach(d => getCountryColor(d.Country));

  let countryData = countryRollup.slice(0, localDonutTop);
  const others = countryRollup.slice(localDonutTop);
  const othersValue = d3.sum(others, d => d.Value);
  const othersCount = d3.sum(others, d => d.Count);
  if (others.length && othersValue > 0) {
    countryData.push({ Country: 'Others', Value: othersValue, Count: othersCount });
  }

  // SVG is reserved for the donut itself. The legend is a real HTML panel
  // so a long country list can scroll instead of overflowing the card.
  const svg = container.append("svg")
    .attr("width", donutWidth)
    .attr("height", height)
    .attr("viewBox", `0 0 ${donutWidth} ${height}`)
    .style("display", "block");

  const g = svg.append("g")
    .attr("transform", `translate(${donutWidth * 0.50},${height / 2})`);

  const pie = d3.pie().value(d => Math.max(0, d.Value)).sort(null);
  const arc = d3.arc().innerRadius(radius * 0.58).outerRadius(radius);
  const hoverArc = d3.arc().innerRadius(radius * 0.55).outerRadius(radius * 1.05);

  const paths = g.selectAll(".country-slice")
    .data(pie(countryData))
    .enter()
    .append("path")
    .attr("class", "country-slice")
    .attr("fill", d => d.data.Country === 'Others' ? '#CBD5E1' : getCountryColor(d.data.Country))
    .style("cursor", d => d.data.Country === 'Others' ? 'default' : 'pointer')
    .each(function(d) { this._current = { startAngle: d.startAngle, endAngle: d.startAngle }; })
    .transition()
    .duration(800)
    .delay((d, i) => i * 55)
    .ease(d3.easeCubicOut)
    .attrTween("d", function(d) {
      const i = d3.interpolate(this._current, d);
      this._current = i(1);
      return t => arc(i(t));
    });

  paths.selection()
    .on("mouseover", function(event, d) {
      const pct = totalValue !== 0 ? Math.abs(d.data.Value / totalValue * 100) : 0;
      d3.select(this).transition().duration(180).attr("d", hoverArc(d));
      showTooltip(event, `<b>${d.data.Country}</b><br/>จำนวนรายการ: ${d3.format(",")(d.data.Count)}<br/>มูลค่า: £${d3.format(",.2f")(d.data.Value)}<br/>สัดส่วน: ${pct.toFixed(1)}%`);
    })
    .on("mouseout", function(event, d) {
      d3.select(this).transition().duration(180).attr("d", arc(d));
      hideTooltip();
    })
    .on("click", (event, d) => {
      if (d.data.Country !== 'Others') {
        selectedCountry = d.data.Country;
        d3.select('#countryFilter').property('value', selectedCountry);
        applyFilters();
      }
    });

  // Center summary
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "-0.15em")
    .style("font-size", "0.78rem")
    .style("fill", "#64748b")
    .text("มูลค่ารวม");

  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "1.15em")
    .style("font-size", "1.05rem")
    .style("font-weight", "700")
    .style("fill", "#0f172a")
    .text(`£${d3.format(",.0f")(totalValue)}`);

  // Country legend — HTML grid with its own scroll, never allowed to
  // escape the chart card. Each country keeps its stable color.
  const legend = container.append("div")
    .attr("class", "country-legend-panel");

  countryData.forEach((d) => {
    const item = legend.append("div")
      .attr("class", "country-legend-item")
      .style("cursor", d.Country === 'Others' ? 'default' : 'pointer');

    item.append("span")
      .attr("class", "country-legend-dot")
      .style("background", d.Country === 'Others' ? '#CBD5E1' : getCountryColor(d.Country));

    item.append("span")
      .attr("class", "country-legend-name")
      .text(d.Country);

    item.on("mouseenter", function(event) {
      paths.filter(p => p.data.Country === d.Country)
        .transition().duration(150).attr("d", hoverArc);

      const pct = totalValue !== 0 ? Math.abs(d.Value / totalValue * 100) : 0;
      showTooltip(event, `<b>${d.Country}</b><br/>จำนวนรายการ: ${d3.format(",")(d.Count)}<br/>มูลค่า: £${d3.format(",.2f")(d.Value)}<br/>สัดส่วน: ${pct.toFixed(1)}%`);
    }).on("mouseleave", function() {
      paths.filter(p => p.data.Country === d.Country)
        .transition().duration(150).attr("d", arc);
      hideTooltip();
    }).on("click", function() {
      if (d.Country !== 'Others') {
        selectedCountry = d.Country;
        d3.select('#countryFilter').property('value', selectedCountry);
        applyFilters();
      }
    });
  });
}

// 3. Column Chart
function renderColumnChart() {
  const container = d3.select("#columnChart");
  container.html("");

  const bounds = container.node().getBoundingClientRect();
  const margin = { top: 20, right: 20, bottom: 45, left: 70 };
  const width = bounds.width - margin.left - margin.right;
  const height = bounds.height - margin.top - margin.bottom;

  // เปรียบเทียบ Sale/Return ได้เสมอ แม้ตัวกรองประเภทหลักเลือกไว้ประเภทเดียว
  const columnDataset = globalDataset.filter(d => {
    const matchCountry = selectedCountry === 'ALL' || d.Country === selectedCountry;
    const matchYear = selectedYear === 'ALL' || String(d.Year) === String(selectedYear);
    const matchMonth = selectedMonth === 'ALL' || String(d.Month) === String(selectedMonth);
    return matchCountry && matchYear && matchMonth;
  });
  const typeData = Array.from(
    d3.rollup(columnDataset, v => ({
      Sales: d3.sum(v, d => d.LineAmount),
      Count: v.length
    }), d => d.TransactionType),
    ([Type, stats]) => ({ Type, ...stats })
  );

  const svg = container.append("svg")
    .attr("width", bounds.width)
    .attr("height", bounds.height)
    .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand().domain(['Sale', 'Return/Cancelled']).range([0, width]).padding(0.45);
  const y = d3.scaleLinear().domain([0, d3.max(typeData, d => d.Sales) * 1.15 || 100]).range([height, 0]);

  svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
  svg.append("g").call(d3.axisLeft(y).ticks(5).tickFormat(d => `£${d/1000}k`));

  // Axes Labels
  svg.append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 38)
    .attr("text-anchor", "middle")
    .text("ประเภทรายการซื้อขาย");

  svg.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -50)
    .attr("text-anchor", "middle")
    .text("มูลค่ารวม (£)");

  svg.selectAll("rect")
    .data(typeData)
    .enter()
    .append("rect")
    .attr("x", d => x(d.Type))
    .attr("width", x.bandwidth())
    .attr("fill", d => TYPE_COLORS[d.Type] || '#3b82f6')
    .attr("rx", 6)
    .attr("y", height)
    .attr("height", 0)
    .transition().duration(700).delay((d,i) => i * 120).ease(d3.easeCubicOut)
    .attr("y", d => y(d.Sales))
    .attr("height", d => height - y(d.Sales))
    .selection()
    .on("mouseover", (e, d) => showTooltip(e, `<b>${d.Type}</b><br/>มูลค่ารายการ: £${d3.format(",.2f")(d.Sales)}<br/>จำนวนรายการ: ${d3.format(",")(d.Count)}`))
    .on("mouseout", hideTooltip);
}

// 4. Scatter Plot (เพิ่ม Legend + ล็อกแกนไม่ให้ติดลบ)
function renderScatterChart() {
  const container = d3.select("#scatterChart");
  container.html("");

  const bounds = container.node().getBoundingClientRect();
  const margin = { top: 35, right: 20, bottom: 45, left: 55 };
  const width = bounds.width - margin.left - margin.right;
  const height = bounds.height - margin.top - margin.bottom;

  let scatterDataset = filteredData.filter(d => d.UnitPrice >= 0 && d.Quantity >= 0);
  if (localScatterPrice !== 'all') scatterDataset = scatterDataset.filter(d => d.UnitPrice <= +localScatterPrice);
  if (localScatterQty > 0) scatterDataset = scatterDataset.filter(d => d.Quantity >= localScatterQty);
  const validData = scatterDataset;
  // กระจายตัวอย่างให้เห็นภาพรวม ไม่เลือกเฉพาะรายการต้นไฟล์
  const sampleData = validData.length > 400
    ? d3.range(400).map(i => validData[Math.floor(i * (validData.length - 1) / 399)])
    : validData;

  const svg = container.append("svg")
    .attr("width", bounds.width)
    .attr("height", bounds.height);

  // Legend
  const legend = svg.append("g")
    .attr("transform", `translate(${margin.left}, 15)`);

  legend.append("circle").attr("cx", 10).attr("cy", 0).attr("r", 6).attr("fill", TYPE_COLORS['Sale']);
  legend.append("text").attr("x", 22).attr("y", 4).text("รายการขายปกติ (Sale)").style("font-size", "12px").style("fill", "#334155");

  legend.append("circle").attr("cx", 180).attr("cy", 0).attr("r", 6).attr("fill", TYPE_COLORS['Return/Cancelled']);
  legend.append("text").attr("x", 192).attr("y", 4).text("รายการคืนเงิน/ยกเลิก (Return)").style("font-size", "12px").style("fill", "#334155");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const xMax = d3.max(sampleData, d => d.UnitPrice) || 10;
  const yMax = d3.max(sampleData, d => d.Quantity) || 10;

  const x = d3.scaleLinear().domain([0, xMax * 1.05]).range([0, width]);
  const y = d3.scaleLinear().domain([0, yMax * 1.05]).range([height, 0]);

  const xAxisGroup = g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x).ticks(6));
  const yAxisGroup = g.append("g").call(d3.axisLeft(y).ticks(6));

  // Axes Labels
  g.append("text")
    .attr("class", "axis-label")
    .attr("x", width / 2)
    .attr("y", height + 38)
    .attr("text-anchor", "middle")
    .text("ราคาต่อหน่วย / Unit Price (£)");

  g.append("text")
    .attr("class", "axis-label")
    .attr("transform", "rotate(-90)")
    .attr("x", -height / 2)
    .attr("y", -40)
    .attr("text-anchor", "middle")
    .text("จำนวนชิ้น / Quantity");

  // Clip Path
  g.append("defs").append("clipPath")
    .attr("id", "scatter-clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

  const scatterGroup = g.append("g").attr("clip-path", "url(#scatter-clip)");

  const dots = scatterGroup.selectAll("circle")
    .data(sampleData)
    .enter()
    .append("circle")
    .attr("cx", d => x(d.UnitPrice))
    .attr("cy", d => y(d.Quantity))
    .attr("r", 5)
    .attr("fill", d => TYPE_COLORS[d.TransactionType] || TYPE_COLORS['Sale'])
    .attr("opacity", 0)
    .transition().duration(550).delay((d,i) => (i % 40) * 8).attr("opacity", 0.75)
    .selection()
    .on("mouseover", (e, d) => showTooltip(e, `<b>${d.Description}</b><br/>ประเภท: ${d.TransactionType}<br/>ราคา: £${d.UnitPrice}<br/>จำนวน: ${d.Quantity} ชิ้น`))
    .on("mouseout", hideTooltip);

  // Zoom & Pan Constraints
  const zoom = d3.zoom()
    .scaleExtent([1, 10])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .on("zoom", (event) => {
      const newX = event.transform.rescaleX(x);
      const newY = event.transform.rescaleY(y);

      xAxisGroup.call(d3.axisBottom(newX).tickFormat(d => d < 0 ? "" : d));
      yAxisGroup.call(d3.axisLeft(newY).tickFormat(d => d < 0 ? "" : d));

      dots.attr("cx", d => newX(d.UnitPrice)).attr("cy", d => newY(d.Quantity));
    });

  svg.call(zoom);

  d3.select('#resetZoomBtn').on('click', () => {
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
  });
}