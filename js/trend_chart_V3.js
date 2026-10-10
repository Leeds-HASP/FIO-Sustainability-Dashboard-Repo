/*
- trend_chart_V3.js
- Renders the environmental footprint timeline chart.
- Reads 52-row weekly bin data from L1 data file.
- Called by dashboard_V3.js as:
- createTrendChart(l1Data, { width })
- Returns a DOM node appended to #trend-container.
 *
- Section map:
- 1a. Config: METRICS, EVENTS_BY_GROUP, LAYOUT constants
- 1b. Parse: Date parsing, smoothed series, annual means
- 1c. Helpers: axisFormatter, yFormatter, pctFormatter, statFmt
- 1d. Controls: ctrlWrapper, topRow, ctrlRow, legend block
- 1e. SVG shell: SVG, groups, axis labels, overlay, tooltip, footnote
- 1f. Event markers: redrawEventMarkers() - uses hoisted xScale
- 1g. Redraw: Full chart redraw on any state change
- 1h. Resize: ResizeObserver - keeps chart inside container
 */


function createTrendChart(data, {width = 960} = {}) {


  /*1a. CONFIG
  All configuration constants live here. LAYOUT
  controls pixel dimensions. METRICS defines columns, colours,
  units and formatters for each environmental metric.
  EVENTS_BY_GROUP defines event overlay markers by group key.
  State variables (activeMKey etc.) track the current user
  selection and drive redraw().

  To change:
  - Metric colours: find the metric key (GHGE, LU, WU,
    composite) and update the colour value.
  - Event dates: find the group key in EVENTS_BY_GROUP and
    update the date strings. Format is YYYY-MM-DD.
    Currently set to 2022 to match dummy data.
  - Chart height: update LAYOUT.H. The SVG will resize.
  - Margin: update LAYOUT.MARGIN. Increase left if y-axis
    labels clip, increase top if event labels clip above.
     */

  const LAYOUT = {
    H: 300,
    MARGIN: {top: 110, right: 20, bottom: 64, left: 88},
    PKG_PAD_FACTOR: 0.12,
    PKG_MIN_RANGE: 1.5,
    EVENT_TICK_Y1: -20,
    EVENT_TICK_Y2: -8,
    EVENT_LABEL_Y: -22,
    DATE_LABEL_Y : 44,
    FOOTNOTE_SIZE: '12px',
    FOOTNOTE_MARGIN: '24px 0 8px 0',
  };

  // MIN_CHART_WIDTH: chart never renders narrower than this value.
  // Below this viewport width horizontal scrolling kicks in.
  const MIN_CHART_WIDTH = 720;

  // H is a let so the ResizeObserver can update it proportionally
  // with width. LAYOUT.H is the maximum value (full-width default).
  let H = LAYOUT.H;
  const {MARGIN} = LAYOUT;

  // totalWidth and W are lets so the ResizeObserver in 1h can update them
  let totalWidth = width;
  let W = totalWidth - MARGIN.left - MARGIN.right;

  const METRICS = {
    composite: {
      col: 'binavg_composite_norm',
      pkg_col: 'binavg_composite_intensity_norm',
      label: 'Composite Impact - Total Sales FP (scaled 0-1)',
      pkg_label: 'Composite Impact - Per-Kg (scaled 0-1)',
      short: 'Composite Impact',
      unit: '(0-1 scale)',
      pkg_unit: '(0-1 scale)',
      colour: '#444444',
      fmt: d3.format('.3f'),
      pkg_fmt: d3.format('.3f'),
    },
    GHGE: {
      col: 'binavg_GHGE_SF',
      pkg_col: 'binavg_GHGE_perkg',
      label: 'GHGE Sales Footprint (kg CO\u2082-eq/day)',
      pkg_label: 'GHGE per kg sold (kg CO\u2082-eq/kg)',
      short: 'GHGE',
      unit: 'kg CO\u2082-eq/day',
      pkg_unit: 'kg CO\u2082-eq/kg',
      colour: '#2ca02c',
      fmt: null,
      pkg_fmt: null,
    },
    LU: {
      col: 'binavg_LU_SF',
      pkg_col: 'binavg_LU_perkg',
      label: 'Land Use Sales Footprint (m\u00b2\u00b7yr/day)',
      pkg_label: 'Land Use per kg sold (m\u00b2\u00b7yr/kg)',
      short: 'Land Use',
      unit: 'm\u00b2\u00b7yr/day',
      pkg_unit: 'm\u00b2\u00b7yr/kg',
      colour: '#ff7f0e',
      fmt: null,
      pkg_fmt: null,
    },
    WU: {
      col: 'binavg_WU_SF',
      pkg_col: 'binavg_WU_perkg',
      label: 'Water Use Sales Footprint (L/day)',
      pkg_label: 'Water Use per kg sold (L/kg)',
      short: 'Water Use',
      unit: 'L/day',
      pkg_unit: 'L/kg',
      colour: '#1f77b4',
      fmt: null,
      pkg_fmt: null,
    },
  };

  const METRIC_OPTIONS = [
    {key: 'GHGE', display: 'GHGE (Greenhouse Gas Emissions)'},
    {key: 'LU', display: 'LU (Land Use)'},
    {key: 'WU', display: 'WU (Water Use)'},
    {key: 'composite', display: 'Composite Impact - Overall'},
  ];

  // update dates to real data once ready.
  const EVENTS_BY_GROUP = {
    public_holidays: [
      {date: '2022-04-18', label: 'Easter Monday Bank Holiday'},
      {date: '2022-05-02', label: 'Early May Bank Holiday'},
      {date: '2022-06-02', label: 'Spring/Jubilee Bank Holiday'},
      {date: '2022-08-29', label: 'Summer Bank Holiday'},
      {date: '2022-09-19', label: "Queen Funeral Bank Holiday"},
      {date: '2022-12-27', label: 'Christmas Day Bank Holiday'},
    ],
    cultural_events: [
      {date: '2022-03-27', label: "Mother's Day"},
      {date: '2022-04-02', label: 'Ramadan Start'},
      {date: '2022-04-15', label: 'Good Friday'},
      {date: '2022-05-02', label: 'Ramadan End'},
      {date: '2022-06-19', label: "Father's Day"},
      {date: '2022-10-24', label: 'Diwali'},
      {date: '2022-10-31', label: 'Halloween'},
      {date: '2022-12-25', label: 'Christmas'},
      {date: '2022-12-31', label: "New Year's Eve"},
    ],
    school_calendar: [
      {date: "2022-02-19", label: "Spring Half Term Start"},
      {date: "2022-02-27", label: "Spring Half Term End"},
      {date: "2022-04-04", label: "Easter Holidays Start"},
      {date: "2022-04-14", label: "Easter Holidays End"},
      {date: "2022-05-28", label: "Summer Half Term Start"},
      {date: "2022-06-05", label: "Summer Half Term End"},
      {date: "2022-07-23", label: "Summer Holidays Start"},
      {date: "2022-09-04", label: "Summer Holidays End"},
      {date: "2022-10-22", label: "Autumn Half Term Start"},
      {date: "2022-10-30", label: "Autumn Half Term End"},
      {date: "2022-12-17", label: "Christmas Holidays Start"},
      {date: "2022-12-30", label: "Christmas Holidays End"},
    ],
    weather_events: [
      {date: '2022-06-16', label: 'June HW (3 days)'},
      {date: '2022-07-18', label: 'July HW (4 days)'},
      {date: '2022-08-12', label: 'August HW (5 days)'},
    ],
    sporting_events: [
      // {date: "2022-02-05", label: "Six Nations Start"},
      {date: "2022-03-19", label: "Six Nations End"},
      // {date: "2022-07-06", label: "UEFA Women's Euro Start"},
      {date: "2022-07-31", label: "UEFA WE End"},
      // {date: "2022-07-28", label: "Commonwealth Games Start"},
      {date: "2022-08-08", label: "CG Games End"},
      // {date: "2022-11-20", label: "FIFA World Cup Start"},
      {date: "2022-12-18", label: "FIFA WC End"},
    ],
  };

  const EVENT_MARKER_ICON =
    '<svg width="8" height="14" style="display:inline-block;vertical-align:-3px">' +
    '<line x1="4" x2="4" y1="0" y2="9" stroke="#aaa" stroke-width="1.5"/>' +
    '<circle cx="4" cy="9" r="3" fill="#aaa"/></svg>';

  const EVENT_FOOTNOTES = {
    public_holidays : 'Hover over a marker ' + EVENT_MARKER_ICON + ' for event details.',
    cultural_events : 'Hover over a marker ' + EVENT_MARKER_ICON + ' for event details.',
    school_calendar : 'Hover over a marker ' + EVENT_MARKER_ICON + ' for event details.  SH = School Holidays',
    weather_events  : 'Hover over a marker ' + EVENT_MARKER_ICON + ' for event details.  HW = Heatwave number in brackets = duration in days',
    sporting_events : 'Hover over a marker ' + EVENT_MARKER_ICON + ' for event details.  ' +
                      'CG = Commonwealth Games  ' +
                      '  WC = World Cup  WE = UEFA Women\'s Euro',
  };

  const EVENT_GROUP_OPTIONS = [
    { key: 'public_holidays', display: 'Public Holidays' },
    { key: 'cultural_events', display: 'Cultural Events' },
    { key: 'school_calendar', display: 'School Calendar' },
    { key: 'weather_events',  display: 'Weather Events'  },
    { key: 'sporting_events', display: 'Sporting Events' },
  ];

  // Chart state variables - changed by control interactions
  let activeMKey       = 'GHGE';
  let activePkg        = false;
  let activeEventGroup = 'public_holidays';
  let xScale           = null; // hoisted: redrawEventMarkers() reads it


  /* 1b. PARSE
  Converts week_start strings to Date objects and
  builds smoothed series arrays from the pre-computed JSON
  columns. Annual means are computed once from the full 52-bin
  series and used in the tooltip percentage deviation display.

  To change:
  - If the JSON column name for week_start changes, update the
    String(d.week_start) reference in the forEach below.
  - Column names for each metric are in METRICS above.
    Do not change them here - change them in METRICS only.
  */

  if (!data.length || typeof data[0].week_start !== 'string') {
    console.error('trend_chart_V3: week_start field missing or not a string');
    const errNode = document.createElement('div');
    errNode.style.cssText = 'font-size:13px;color:#c00;padding:12px';
    errNode.textContent   = 'Chart data error - check console for details.';
    return errNode;
  }

  const parseDate = d3.timeParse('%d/%m/%Y');
  const parseEventDate = d3.timeParse('%Y-%m-%d')
  const fmtDate   = d3.timeFormat('%d %b %Y');
  const fmtInput  = d3.timeFormat('%Y-%m-%d');

  data.forEach(function (d) {
    d.date = parseDate(String(d.week_start).trim());
  });

  function buildSmoothedFromCol(rows, col) {
    return rows
      .filter(function (d) {
        return d.date != null && d[col] != null && !isNaN(d[col]);
      })
      .map(function (d) { return { date: d.date, value: +d[col] }; });
  }

  const smoothed = {
    composite : buildSmoothedFromCol(data, 'binavg_composite_norm'),
    GHGE      : buildSmoothedFromCol(data, 'binavg_GHGE_SF'),
    LU        : buildSmoothedFromCol(data, 'binavg_LU_SF'),
    WU        : buildSmoothedFromCol(data, 'binavg_WU_SF'),
  };

  const smoothedPkg = {
    composite : buildSmoothedFromCol(data, 'binavg_composite_intensity_norm'),
    GHGE      : buildSmoothedFromCol(data, 'binavg_GHGE_perkg'),
    LU        : buildSmoothedFromCol(data, 'binavg_LU_perkg'),
    WU        : buildSmoothedFromCol(data, 'binavg_WU_perkg'),
  };

  const annualMeans    = {};
  const annualMeansPkg = {};
  Object.keys(METRICS).forEach(function (m) {
    annualMeans[m]    = smoothed[m].length
      ? d3.mean(smoothed[m],    function (d) { return d.value; }) : 0;
    annualMeansPkg[m] = smoothedPkg[m].length
      ? d3.mean(smoothedPkg[m], function (d) { return d.value; }) : 0;
  });

  const dateMinStr = fmtInput(d3.min(data, function (d) { return d.date; }));
  const dateMaxStr = fmtInput(d3.max(data, function (d) { return d.date; }));
    console.log(
    'L1 rows:', data.length,
    '| first week_start:', data[0] && data[0].week_start,
    '| GHGE SF sample:', data[0] && data[0].binavg_GHGE_SF,
    '| smoothed GHGE points:', smoothed.GHGE.length
  );


  /*1c. HELPERS
  axisFormatter provides short SI labels for y-axis
  ticks (e.g. "700K", "1.0M"). yFormatter spells out "million"
  for tooltip values to avoid the d3 SI rounding boundary where
  999,500 rounds to "1.0M". pctFormatter adds sign prefix.
  statFmt is used in the legend block for annual mean display.

  To change:
  - Number of decimal places: edit the d3.format strings.
  - Threshold for "million" vs "K": change the 1e6 and 1e3
    comparisons in yFormatter.
  */

  function axisFormatter(v) {
    const abs = Math.abs(v);
    if (abs === 0)  return '0';
    if (abs >= 1e9) return d3.format('.1s')(v).replace('G', 'B');
    if (abs >= 1e6) return d3.format('.2s')(v);
    if (abs >= 1e3) return d3.format('.2s')(v).replace('k', 'K');
    if (abs < 10)   return d3.format('.2f')(v);
    return d3.format('.1f')(v);
  }

  function yFormatter(v, cfg) {
    const fmtFn = activePkg ? cfg.pkg_fmt : cfg.fmt;
    if (fmtFn) return fmtFn(v);
    const abs = Math.abs(v);
    if (abs >= 1e9) return d3.format('.2f')(v / 1e9) + ' billion';
    if (abs >= 1e6) return d3.format('.2f')(v / 1e6) + ' million';
    if (abs >= 1e3) return d3.format('.0f')(v / 1e3) + 'K';
    if (abs < 10)   return d3.format('.2f')(v);
    return d3.format('.1f')(v);
  }

  function pctFormatter(v) {
    if (v == null || isNaN(v)) return '-';
    return (v >= 0 ? '+' : '') + d3.format('.1f')(v) + '%';
  }

  function statFmt(v) {
    if (v == null || isNaN(v)) return '-';
    const abs = Math.abs(v);
    if (abs >= 1e6) return d3.format('.2f')(v / 1e6) + ' million';
    if (abs >= 1e3) return d3.format('.0f')(v / 1e3) + 'K';
    if (abs >= 10)  return d3.format('.1f')(v);
    return d3.format('.2f')(v);
  }


  /* 1d. CONTROLS
  Builds all HTML control elements inside
  ctrlWrapper using D3 append calls. ctrlWrapper uses
  position: relative so the absolute-positioned legend block
  can be anchored to its top-right corner without affecting
  the flex row layout of topRow and ctrlRow.
  topRow: metric dropdown + per-kg toggle.
  ctrlRow: event overlay + date pickers + reset.

  To change:
  - Metric dropdown options: edit METRIC_OPTIONS in 1a.
  - Event group options: edit EVENT_GROUP_OPTIONS in 1a.
  - Control font size: change the font-size style calls below.
  */

  const container = d3.create('div')
    .style('font-family', 'sans-serif')
    .style('position', 'relative');

  // Static chart heading
  container.append('div')
    .style('font-size', '20px')
    .style('font-weight', '700')
    .style('color', '#222')
    .style('margin-bottom', '6px')
    .text('Timeline of Environmental Impact from Food and Drink Sales');

  // Static description - does not change with controls
  container.append('div')
    .style('font-size', '12px')
    .style('color', '#777')
    .style('line-height', '1.6')
    .style('margin-bottom', '14px')
    .text('Use this chart to explore how the environmental impact of food and drink sales varies throughout the year. '
    );

  // position: relative anchors the absolute legend block on wide screens.
  // display: flex with column direction enforces visual stack order:
  //   topRow (wrapping controls) -> legendBlock -> ctrlRow
  // When legendBlock switches to position: relative on narrow screens it
  // re-enters flow between topRow and ctrlRow in the correct position.
  const ctrlWrapper = container.append('div')
    .style('position', 'relative')
    .style('display', 'flex')
    .style('flex-direction', 'column');

  // flex-wrap: wrap allows metric dropdown and per-kg pill to break onto
  // a second line when there is not enough room side by side.
  // padding-right reserves space for the absolute legend block on wide
  // screens. applyLegendLayout() sets it to 0 on narrow screens when
  // the legend drops into normal flow below the controls.
  const topRow = ctrlWrapper.append('div')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('gap', '10px')
    .style('flex-wrap', 'wrap')
    .style('margin-bottom', '8px')
    .style('padding-right', '240px');

  const metricSelect = topRow.append('select')
    .style('font-size', '12px').style('padding', '4px 8px')
    .style('border-radius', '4px').style('border', '1px solid #ccc')
    .style('background', 'white').style('cursor', 'pointer')
    .on('change', function () {
      activeMKey = d3.select(this).property('value');
      redraw();
    });

  METRIC_OPTIONS.forEach(function (opt) {
    metricSelect.append('option')
      .attr('value', opt.key)
      .property('selected', opt.key === activeMKey)
      .text(opt.display);
  });

  topRow.append('div')
    .style('width', '1px').style('height', '18px')
    .style('background', '#ddd').style('margin', '0 4px');

  // Per-kg toggle pill
  const pkgPill = topRow.append('div')
    .style('display', 'flex')
    .style('border', '1px solid #ccc')
    .style('border-radius', '4px')
    .style('overflow', 'hidden');

  const btnTotal = pkgPill.append('button')
    .text('Total SF')
    .style('font-size', '12px').style('padding', '4px 10px')
    .style('border', 'none').style('cursor', 'pointer')
    .style('font-family', 'inherit')
    .style('transition', 'background 0.15s, color 0.15s');

  const btnPkg = pkgPill.append('button')
    .text('Per kg')
    .style('font-size', '12px').style('padding', '4px 10px')
    .style('border', 'none').style('border-left', '1px solid #ccc')
    .style('cursor', 'pointer').style('font-family', 'inherit')
    .style('transition', 'background 0.15s, color 0.15s');

  function syncPkgToggle() {
    btnTotal
      .style('background', !activePkg ? '#f5f1fe' : '#fff')
      .style('color',      !activePkg ? '#111' : '#555');
    btnPkg
      .style('background',  activePkg ? '#f5f1fe' : '#fff')
      .style('color',       activePkg ? '#111' : '#555');
  }

  btnTotal.on('click', function () {
    if (activePkg) { activePkg = false; syncPkgToggle(); redraw(); }
  });
  btnPkg.on('click', function () {
    if (!activePkg) { activePkg = true; syncPkgToggle(); redraw(); }
  });
  syncPkgToggle();

  // Legend block: absolute top-right of ctrlWrapper
  // z-index 5 keeps it above rows
  const legendBlock = ctrlWrapper.append('div')
    .style('position', 'absolute')
    .style('top', '0').style('right', '0')
    .style('z-index', '5')
    .style('display', 'flex')
    .style('flex-direction', 'column')
    .style('align-items', 'flex-end')
    .style('gap', '3px')
    .style('padding', '4px 8px')
    .style('background', 'rgba(255,255,255,0.92)')
    .style('border-radius', '4px');

  const swatchRow = legendBlock.append('div')
    .style('display', 'flex').style('align-items', 'center').style('gap', '8px');

  const legendSwatch = swatchRow.append('svg')
    .attr('width', '28').attr('height', '10').style('flex-shrink', '0');

  legendSwatch.append('line')
    .attr('x1', '0').attr('y1', '5').attr('x2', '28').attr('y2', '5')
    .attr('stroke-width', '2.5').attr('stroke-linecap', 'round')
    .attr('class', 'legend-line');

  const legendLabel = swatchRow.append('span')
    .style('font-size', '12px').style('color', '#555');

  // Annual mean values: font-weight 600 applied to value spans (bold per spec)
  const legendMeanSF = legendBlock.append('span')
    .style('font-size', '10px').style('color', '#444');

  const legendMeanPkg = legendBlock.append('span')
    .style('font-size', '10px').style('color', '#444');

  // Bottom row: event overlay + date pickers + reset
  const ctrlRow = ctrlWrapper.append('div')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('gap', '10px')
    .style('flex-wrap', 'wrap')
    .style('margin-bottom', '12px');

  ctrlRow.append('span')
    .style('font-size', '12px').style('color', '#666')
    .text('Event overlay:');

  const eventGroupSelect = ctrlRow.append('select')
    .style('font-size', '12px').style('padding', '3px 6px')
    .style('border-radius', '4px').style('border', '1px solid #ccc')
    .style('background', 'white').style('cursor', 'pointer')
    .on('change', function () {
      activeEventGroup = d3.select(this).property('value');
      if (xScale) redrawEventMarkers();
    });

  EVENT_GROUP_OPTIONS.forEach(function (opt) {
    eventGroupSelect.append('option')
      .attr('value', opt.key)
      .property('selected', opt.key === activeEventGroup)
      .text(opt.display);
  });

  ctrlRow.append('div')
    .style('width', '1px').style('height', '18px')
    .style('background', '#ddd').style('margin', '0 2px');

  ctrlRow.append('span')
    .style('font-size', '12px').style('color', '#666')
    .text('From:');

  const startPicker = ctrlRow.append('input')
    .attr('type', 'date').attr('value', dateMinStr)
    .attr('min', dateMinStr).attr('max', dateMaxStr)
    .style('font-size', '12px').style('padding', '3px 6px')
    .style('border-radius', '4px').style('border', '1px solid #ccc')
    .on('change', function () {
      if (this.value > endPicker.property('value'))
        this.value = endPicker.property('value');
      redraw();
    });

  ctrlRow.append('span')
    .style('font-size', '12px').style('color', '#666')
    .text('To:');

  const endPicker = ctrlRow.append('input')
    .attr('type', 'date').attr('value', dateMaxStr)
    .attr('min', dateMinStr).attr('max', dateMaxStr)
    .style('font-size', '12px').style('padding', '3px 6px')
    .style('border-radius', '4px').style('border', '1px solid #ccc')
    .on('change', function () {
      if (this.value < startPicker.property('value'))
        this.value = startPicker.property('value');
      redraw();
    });

  const resetBtn = ctrlRow.append('button')
    .text('Reset dates')
    .style('font-size', '12px').style('padding', '4px 10px')
    .style('border-radius', '4px').style('border', '1px solid #bbb')
    .style('background', '#fff').style('color', '#555')
    .style('cursor', 'pointer').style('font-family', 'inherit')
    .on('click', function () {
      startPicker.property('value', dateMinStr);
      endPicker.property('value',   dateMaxStr);
      redraw();
    });

  function syncResetButton() {
    const atFull =
      startPicker.property('value') === dateMinStr &&
      endPicker.property('value')   === dateMaxStr;
    resetBtn
      .attr('disabled',        atFull ? true : null)
      .style('opacity',        atFull ? '0.35' : '1')
      .style('cursor',         atFull ? 'not-allowed' : 'pointer')
      .style('pointer-events', atFull ? 'none' : 'auto');
  }


  /* 1e. SVG SHELL  
  Creates the SVG and all static group elements.
  Groups are layered in DOM order (painter's algorithm):
  gridGroup behind everything, eventGroup above grid but
  below the trend line, lineGroup on top. The overlay rect
  sits above all visible elements and captures mouse events.

  To change:
  - Chart height: change LAYOUT.H in 1a (not here).
  - SVG overflow visible: required for tooltips and event
    labels that render outside the SVG bounding box. Do not
    change to hidden here - the chart-section card in CSS
    has overflow: hidden to clip at the card boundary.
  - Adding a new group layer: append it here in the correct
    z-order position before or after existing groups.
  */

  const tpChartScroll = container.append('div')
    .style('overflow-x', 'auto')
    .style('overflow-y', 'visible');

  const tpScrollInner = tpChartScroll.append('div')
    .style('min-width', MIN_CHART_WIDTH + 'px')
    .style('position', 'relative');

  const svg = tpScrollInner.append('svg')
    .attr('width',  totalWidth)
    .attr('height', H + MARGIN.top + MARGIN.bottom)
    .style('overflow', 'visible');

  const g = svg.append('g')
    .attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');

  const gridGroup  = g.append('g').attr('class', 'grid');
  const eventGroup = g.append('g').attr('class', 'events');
  const lineGroup  = g.append('g').attr('class', 'line');
  const xAxisGroup = g.append('g').attr('transform', 'translate(0,' + H + ')');
  const yAxisGroup = g.append('g');

  // Y-axis label: rotated text, updated in redraw() when metric changes
  const yAxisLabelEl = g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -(H / 2))
    .attr('y', -(MARGIN.left - 10))
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#666');

  // Date x-axis label: static, stored as reference so resize can reposition it
  const dateLabelEl = g.append('text')
    .attr('x', W / 2)
    .attr('y', H + LAYOUT.DATE_LABEL_Y)
    .attr('text-anchor', 'middle')
    .style('font-size', '11px')
    .style('fill', '#666')
    .text('Date');

  // Hover elements
  const hoverLine = g.append('line')
    .attr('y1', 0).attr('y2', H)
    .attr('stroke', '#aaa').attr('stroke-width', 1)
    .attr('stroke-dasharray', '4,3')
    .style('display', 'none');

  const hoverDot = g.append('circle')
    .attr('r', 5).attr('fill', 'white').attr('stroke', '#555')
    .attr('stroke-width', 2)
    .style('display', 'none');

  // Overlay rect captures mouse events across the full chart area.
  // Stored as a variable so the resize handler can update its width.
  const overlay = g.append('rect')
    .attr('width', W).attr('height', H)
    .attr('fill', 'none')
    .style('pointer-events', 'all');

  // Tooltip div: absolutely positioned, hidden until hover
  const tooltip = container.append('div')
    .style('position', 'absolute').style('pointer-events', 'none')
    .style('background', 'rgba(255,255,255,0.97)')
    .style('border', '1px solid #ccc').style('border-radius', '6px')
    .style('padding', '8px 12px').style('font-size', '12px')
    .style('line-height', '1.8')
    .style('box-shadow', '0 2px 8px rgba(0,0,0,0.12)')
    .style('display', 'none').style('max-width', '240px')
    .style('z-index', '10');

  const evtTooltip = container.append('div')
    .style('position', 'absolute').style('pointer-events', 'none')
    .style('background', 'rgba(255,255,255,0.97)')
    .style('border', '1px solid #ddd').style('border-radius', '5px')
    .style('padding', '5px 9px').style('font-size', '12px')
    .style('line-height', '1.5')
    .style('box-shadow', '0 1px 6px rgba(0,0,0,0.10)')
    .style('display', 'none').style('max-width', '200px')
    .style('z-index', '21');

  // footnoteEl inside tpChartScroll scrolls horizontally with the chart.
  const footnoteEl = tpChartScroll.append('p')
    .style('font-size', LAYOUT.FOOTNOTE_SIZE)
    .style('color', '#767676')
    .style('white-space', 'nowrap')
    .style('margin', LAYOUT.FOOTNOTE_MARGIN)
    .style('min-height', '18px')
    .html(EVENT_FOOTNOTES['public_holidays'] || '');


  /* 1f. EVENT MARKERS
  redrawEventMarkers() draws vertical dashed lines,
  tick marks, dots, and rotated labels for all events in the
  active group. It reads xScale which is assigned in redraw()
  before this function is called. Clearing and redrawing the
  full eventGroup on every call keeps the logic simple and
  avoids stale markers after date range changes.

  To change:
  - Label colour: update the fill value in the text append.
  - Line style: update stroke-dasharray on the long dashed line.
  - Tick height above the chart: update LAYOUT.EVENT_TICK_Y1
    and LAYOUT.EVENT_LABEL_Y in 1a.
  */

  function redrawEventMarkers() {
    if (!xScale) return;
    eventGroup.selectAll('*').remove();

    const domainRange  = xScale.domain();
    const domMin       = domainRange[0];
    const domMax       = domainRange[1];
    const activeEvents = EVENTS_BY_GROUP[activeEventGroup] || [];

    activeEvents.forEach(function (evt) {
      const evtDate = parseEventDate(evt.date);
      if (!evtDate || evtDate < domMin || evtDate > domMax) return;

      const ex = xScale(evtDate);

      const markerG = eventGroup.append('g')
        .attr('class', 'event-marker')
        .style('cursor', 'pointer');

      // Invisible enlarged hover area around the tick and dot
      markerG.append('rect')
        .attr('x', ex - 8).attr('y', LAYOUT.EVENT_TICK_Y1 - 4)
        .attr('width', 16).attr('height', LAYOUT.EVENT_TICK_Y2 - LAYOUT.EVENT_TICK_Y1 + 12)
        .attr('fill', 'transparent');

      // Full-height dashed line through chart body
      markerG.append('line')
        .attr('x1', ex).attr('x2', ex)
        .attr('y1', LAYOUT.EVENT_TICK_Y2).attr('y2', H)
        .attr('stroke', '#bbb').attr('stroke-width', 1)
        .attr('stroke-dasharray', '4,3')
        .style('pointer-events', 'none');

      // Short solid tick above grid
      markerG.append('line')
        .attr('x1', ex).attr('x2', ex)
        .attr('y1', LAYOUT.EVENT_TICK_Y1).attr('y2', LAYOUT.EVENT_TICK_Y2)
        .attr('stroke', '#aaa').attr('stroke-width', 1.5);

      // Dot at the grid boundary
      markerG.append('circle')
        .attr('cx', ex).attr('cy', LAYOUT.EVENT_TICK_Y2)
        .attr('r', 3).attr('fill', '#aaa');

      markerG
        .on('mouseover', function (event) {
          tooltip.style('display', 'none');
          evtTooltip.style('display', null).html(
            '<div style="font-weight:600;color:#888;margin-bottom:2px">' +
            evt.label + '</div>' +
            '<div style="color:#555">' + fmtDate(evtDate) + '</div>'
          );
          const cRect     = container.node().getBoundingClientRect();
          const tipW      = 190;
          const cursorX   = event.clientX - cRect.left;
          const openRight = cursorX + tipW + 15 < cRect.width;
          evtTooltip
            .style('left', (openRight
              ? cursorX + 10
              : cursorX - tipW - 10) + 'px')
            .style('top', (event.clientY - cRect.top - 40) + 'px');
        })
        .on('mouseleave', function () { evtTooltip.style('display', 'none'); });
    });

    footnoteEl.html(EVENT_FOOTNOTES[activeEventGroup] || '');
  }


  /* 1g. REDRAW
  Full chart redraw triggered by any control change.
  Reads current state (activeMKey, activePkg, date range),
  filters plot data, recomputes scales, re-renders axes,
  gridlines, event markers, and the trend line. The tooltip
  and hover handlers are also re-attached here because the
  bisect closure needs the current plotData array.

  Composite metric: y-axis domain fixed to [0, 1] with
  explicit tick values [0, 0.2, 0.4, 0.6, 0.8, 1.0].

  To change:
  - Curve type: change d3.curveMonotoneX to another d3 curve.
  - Line thickness: change stroke-width in the path append.
  - Animation duration: change the transition duration (600ms).
  - Tooltip content: edit the html() template string below.
  */

  function redraw() {

    const cfg  = METRICS[activeMKey];
    const src  = activePkg ? smoothedPkg : smoothed;
    const mean = activePkg ? annualMeansPkg[activeMKey] : annualMeans[activeMKey];

    const dFrom = new Date(startPicker.property('value') + 'T00:00:00');
    const dTo   = new Date(endPicker.property('value')   + 'T00:00:00');

    const plotData = src[activeMKey].filter(function (d) {
      return d.date >= dFrom && d.date <= dTo;
    });
    if (!plotData.length) return;

    xScale = d3.scaleTime()
      .domain([dFrom, dTo])
      .range([0, W]);

    // Y scale: composite fixed 0.4-1, all others auto-range with padding
    let yDomainMin, yDomainMax;
    if (activeMKey === 'composite') {
      yDomainMin = 0.4;
      yDomainMax = 1;
    } else {
      const ext   = d3.extent(plotData, function (d) { return d.value; });
      let yLow = ext[0], yHigh = ext[1];
      if (activePkg && LAYOUT.PKG_MIN_RANGE > 0) {
        const span = yHigh - yLow;
        if (span < LAYOUT.PKG_MIN_RANGE) {
          const mid = (yLow + yHigh) / 2;
          yLow  = mid - LAYOUT.PKG_MIN_RANGE / 2;
          yHigh = mid + LAYOUT.PKG_MIN_RANGE / 2;
        }
      }
      const padFactor = activePkg ? LAYOUT.PKG_PAD_FACTOR : 0.08;
      const yPad      = (yHigh - yLow) * padFactor;
      yDomainMin      = yLow  - yPad;
      yDomainMax      = yHigh + yPad;
    }

    const yScale = d3.scaleLinear()
      .domain([yDomainMin, yDomainMax])
      .range([H, 0]);

    const regularTicks = d3.timeMonth.range(d3.timeMonth.ceil(dFrom), dTo);
    const allTicks     = (dFrom.getMonth() === 0 && dFrom.getDate() > 1)
      ? [dFrom].concat(regularTicks) : regularTicks;

    let visibleTicks = allTicks;
    let xTickFormat;

    if (W < 200) {
      // Very narrow: quarterly ticks, short name only
      visibleTicks = allTicks.filter(function (d) {
        return d.getMonth() % 3 === 0;
      });
      xTickFormat = d3.timeFormat('%b');
    } else if (W < 600) {
      // Narrow: every other month, short name only
      visibleTicks = allTicks.filter(function (_, i) { return i % 2 === 0; });
      xTickFormat  = d3.timeFormat('%b');
    } else {
      // Wide: all monthly ticks with year
      xTickFormat = d3.timeFormat('%b %Y');
    }

    xAxisGroup.call(
      d3.axisBottom(xScale)
        .tickValues(visibleTicks)
        .tickFormat(xTickFormat)
    );
    xAxisGroup.selectAll('text')
      .style('font-size', W < 400 ? '9px' : '10px')
      .attr('dy', '0.8em');

    // Y-axis: composite uses explicit ticks, others use auto
    const yAxisCall = activeMKey === 'composite'
      ? d3.axisLeft(yScale)
          .tickValues([0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
          .tickFormat(d3.format('.1f'))
      : d3.axisLeft(yScale).ticks(6).tickFormat(axisFormatter);

    yAxisGroup.call(yAxisCall);
    yAxisGroup.selectAll('text').style('font-size', '10px');
    yAxisLabelEl.text(activePkg ? cfg.pkg_label : cfg.label);

    // Horizontal gridlines
    gridGroup.selectAll('*').remove();
    const gridAxis = d3.axisLeft(yScale).tickSize(-W).tickFormat('');
    if (activeMKey === 'composite') {
      gridAxis.tickValues([0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]);
    } else {
      gridAxis.ticks(6);
    }
    gridGroup.call(gridAxis);
    gridGroup.selectAll('line')
      .attr('stroke', '#e8e8e8')
      .attr('stroke-dasharray', '2,2');
    gridGroup.select('.domain').remove();

    redrawEventMarkers();

    // Trend line with draw-on animation
    lineGroup.selectAll('*').remove();

    const lineGen = d3.line()
      .x(function (d) { return xScale(d.date);  })
      .y(function (d) { return yScale(d.value); })
      .curve(d3.curveMonotoneX)
      .defined(function (d) { return d.value != null && !isNaN(d.value); });

    const path = lineGroup.append('path')
      .datum(plotData)
      .attr('fill', 'none')
      .attr('stroke', cfg.colour)
      .attr('stroke-width', 2.2)
      .attr('d', lineGen);

    const pathLen = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', pathLen)
      .attr('stroke-dashoffset', pathLen)
      .transition().duration(600)
      .attr('stroke-dashoffset', 0);

    // Hover tooltip
    const bisect = d3.bisector(function (d) { return d.date; }).left;

    overlay
      .on('mousemove', function (event) {
        const mx  = d3.pointer(event, this)[0];
        const x0  = xScale.invert(mx);
        const i   = bisect(plotData, x0, 1);
        const d0  = plotData[i - 1];
        const d1  = plotData[i];
        const pt  = (!d1 || x0 - d0.date < d1.date - x0) ? d0 : d1;
        if (!pt) return;

        const px = xScale(pt.date);
        const py = yScale(pt.value);

        hoverLine
          .style('display', null)
          .attr('stroke', cfg.colour)
          .attr('x1', px).attr('x2', px);

        hoverDot
          .style('display', null)
          .attr('cx', px).attr('cy', py)
          .attr('stroke', cfg.colour);

        const pctDev    = mean ? ((pt.value - mean) / mean) * 100 : null;
        const pctStr    = pctFormatter(pctDev);
        const pctColour = pctDev >= 0 ? '#d62728' : '#2ca02c';
        const activeUnit = activePkg ? cfg.pkg_unit : cfg.unit;
        const tipH      = 130;
        const tipW      = 240;
        const cRect     = container.node().getBoundingClientRect();
        const left      = event.clientX - cRect.left + 14;
        const top       = event.clientY - cRect.top;
        const flipUp    = top + tipH + 10 > cRect.height;

        tooltip
          .style('display', null)
          .html(
            '<div style="font-weight:600;color:' + cfg.colour +
            ';margin-bottom:3px">' + cfg.short +
            (activePkg ? ' per kg' : ' Total SF') + '</div>' +
            '<div><b>Week of:</b> ' + fmtDate(pt.date) + '</div>' +
            '<div><b>Value:</b> ' + yFormatter(pt.value, cfg) +
            ' ' + cfg.unit + '</div>' +
            '<hr style="margin:5px 0;border:none;border-top:1px solid #eee"/>' +
            '<div><b>Annual mean:</b> ' + yFormatter(mean, cfg) +
            ' ' + cfg.unit + '</div>' +
            '<div><b>vs annual mean:</b> ' +
            '<span style="color:' + pctColour + '">' + pctStr + '</span></div>' +
            '<div style="font-size:10px;color:#bbb;margin-top:3px">' +
            'Values shown are averaged over 7 days</div>'
          )
          .style('left',
            ((left + tipW > cRect.width ? left - tipW - 24 : left)) + 'px')
          .style('top', (flipUp ? top - tipH - 10 : top + 10) + 'px');
      })
      .on('mouseleave', function () {
        hoverLine.style('display', 'none');
        hoverDot.style('display',  'none');
        tooltip.style('display',   'none');
      });

    // Legend swatch colour and annual mean values.
    legendSwatch.select('.legend-line').attr('stroke', cfg.colour);
    legendLabel
      .style('color', cfg.colour)
      .text(cfg.short + ' - ' + (activePkg ? 'Per kg' : 'Total SF'));

    legendMeanSF.html(
      'Annual mean SF: <b style="font-weight:600">' +
      statFmt(annualMeans[activeMKey]) + ' ' + cfg.unit + '</b>'
    );
    legendMeanPkg.html(
      'Annual mean per kg: <b style="font-weight:600">' +
      statFmt(annualMeansPkg[activeMKey]) + ' ' + cfg.pkg_unit + '</b>'
    );

    syncResetButton();
  }


  /* 1h. RESPONSIVE RESIZE 
  A ResizeObserver watches the closest
  .chart-section ancestor. When its width changes (window
  resize, sidebar proportion change, panel becoming visible),
  the observer fires after a 120ms debounce, updates totalWidth
  and W, adjusts the SVG width attribute and all elements that
  depend on W, then calls redraw() to re-render axes and chart
  content at the new width.

  On narrow screens (below 768px) the .chart-section spans
  the full viewport width minus card padding, so the chart
  automatically uses the full available space.

  To change:
  - Debounce delay: change the 120 value (milliseconds). Lower
    values give snappier response but more redraws.
  - Minimum chart width: change in Math.max(). Below
    a point the controls and category labels become unreadable.
  - Padding subtraction: the 48 subtracts the chart-section's
    horizontal padding (2 x 24px).
  */

  let resizeTimer = null;

  // Computes a proportional H from the current totalWidth.
  // Ratio 0.31 matches the original 300px / ~960px full-width shape.
  // Clamped between 180px (minimum readable) and LAYOUT.H (300px max).
  // To change the proportion: adjust 0.31.
  // To change the minimum height: adjust 180.
  function computeH(w) {
    return Math.min(
      Math.max(Math.round(w * 0.31), 180),
      LAYOUT.H
    );
  }

  function applyNewH(newH) {
    H = newH;
    svg.attr('height', H + MARGIN.top + MARGIN.bottom);
    xAxisGroup.attr('transform', 'translate(0,' + H + ')');
    hoverLine.attr('y2', H);
    overlay.attr('height', H);
    yAxisLabelEl.attr('x', -(H / 2));
    dateLabelEl.attr('y', H + LAYOUT.DATE_LABEL_Y);
  }

  const resizeObserver = new ResizeObserver(function (entries) {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!entries.length) return;
      const entry      = entries[entries.length - 1];

      // containerW: actual visible width of the chart-section viewport.
      // newTotal: chart render width, floored at MIN_CHART_WIDTH.
      // When containerW < MIN_CHART_WIDTH the chart stays at MIN_CHART_WIDTH
      // and tpChartScroll provides horizontal scrolling.
      const containerW = Math.floor(entry.contentRect.width) - 48;
      const newTotal   = Math.max(containerW, MIN_CHART_WIDTH);

      // Legend narrow check uses containerW (actual viewport) not newTotal,
      // so the legend drops below controls when the screen is physically
      // narrow, even if the chart renders wider than the viewport.
      const narrow = containerW < 520;

      legendBlock
        .style('position',    narrow ? 'relative' : 'absolute')
        .style('top',         narrow ? 'auto' : '0')
        .style('right',       narrow ? 'auto' : '0')
        .style('margin-top',  narrow ? '8px'  : '0')
        .style('align-items', narrow ? 'flex-start' : 'flex-end');
      topRow.style('padding-right', narrow ? '0' : '240px');

      if (Math.abs(newTotal - totalWidth) <= 4) return;
      totalWidth = newTotal;
      W          = totalWidth - MARGIN.left - MARGIN.right;
      svg.attr('width', totalWidth);
      overlay.attr('width', W);
      dateLabelEl.attr('x', W / 2);

      redraw();
    }, 120);
  });

  // Fall back to the container's parent if chart-section is not found.
  setTimeout(function () {
    const node = container.node();
    if (!node.parentElement) return;

    const target     = node.closest('.chart-section') || node.parentElement;
    resizeObserver.observe(target);

    const containerW = Math.floor(target.getBoundingClientRect().width) - 48;
    const initW      = Math.max(containerW, MIN_CHART_WIDTH);

    // Legend layout and padding use containerW (actual viewport width)
    const narrow = containerW < 520;
    legendBlock
      .style('position',    narrow ? 'relative' : 'absolute')
      .style('top',         narrow ? 'auto' : '0')
      .style('right',       narrow ? 'auto' : '0')
      .style('margin-top',  narrow ? '8px'  : '0')
      .style('align-items', narrow ? 'flex-start' : 'flex-end');
    topRow.style('padding-right', narrow ? '0' : '240px');

    if (Math.abs(initW - totalWidth) > 4) {
      totalWidth = initW;
      W          = totalWidth - MARGIN.left - MARGIN.right;
      applyNewH(computeH(totalWidth));
      svg.attr('width', totalWidth);
      overlay.attr('width', W);
      dateLabelEl.attr('x', W / 2);
      redraw();
    }
  }, 0);


  redraw();
  return container.node();
}