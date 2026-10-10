/*
- heatmap_V3.js
- Renders the category-level environmental footprint heatmap.
- Reads weekly bin data from L2a_weekly_updated.json (weekly only).
- Called by dashboard_V3.js as:
- createHeatmap(weeklyData, { width, onStats })
- Returns a DOM node appended to #heatmap-container.
 *
- Section map:
- 1a. Config METRICS, EVENTS_BY_GROUP, LAYOUT constants
- 1b. Parse Data maps, date helpers, weekly structures
- 1c. Helpers Row geometry, value formatters
- 1d. ControlsHeading, description, ctrlWrapper, rows, legend block
- 1e. Gradient legend HTML colour scale legend between controls and chart
- 1f. SVG shell Sticky headerSVG + scrolling bodySVG
- 1g. RedrawFull redraw on any state change
- 1h. ResizeResizeObserver - keeps chart inside container
 */


function createHeatmap(weeklyData, { width = 960, onStats = null } = {}) {


  /* 1a. CONFIG
  All configuration constants in one block.
  LAYOUT controls pixel dimensions. METRICS defines column
  names, colour interpolators, and units per metric.
  EVENTS_BY_GROUP defines event overlay markers by group.
  State variables track the current user selection.

  To change:
  - Metric colours/interpolators: find the metric key and
    update interpolator or pkg_interpolator.
  - Event dates: update date strings in EVENTS_BY_GROUP.
    Currently 2023 to match dummy data. Change to 2022
    when data is connected.
  - Chart height range: update MIN_CHART_H and MAX_CHART_H. */

  const LAYOUT = {
    MARGIN: { top: 56, right: 15, bottom: 56, left: 154 },
    HEADER_H: 56,    // must match MARGIN.top exactly
    MIN_CHART_H: 270,
    MAX_CHART_H: 1200,
    GAP: 2,     // px gap between rows
    MONTH_GAP: 0,     // px gap between month columns (0 = none)
    ROW_GROUP_SIZE: 5,     // divider drawn every N rows
    MIN_ROW_H: 8,     // minimum row height in px
    RANK_AXIS_PAD: 48,    // space on right for rank numbers
    MISSING_FILL: '#f5f5f5',
    DIM_OPACITY: 1,     // 1 = no row dimming on hover
  };

  const { MARGIN } = LAYOUT;

  // MIN_CHART_WIDTH: chart never renders narrower than this.
  // Below this viewport width horizontal scrolling kicks in.
  const MIN_CHART_WIDTH = 760;

  let totalWidth = Math.max(width, MIN_CHART_WIDTH);
  let W          = totalWidth - MARGIN.left - MARGIN.right;

  const METRICS = {
    GHGE: {
      weekly_col          : 'GHGE_weekly_mean',
      weekly_pkg_col      : 'GHGE_perkg_weekly_mean',
      weekly_rank_col     : 'GHGE_weekly_rank',
      annual_rank_col     : 'GHGE_annual_rank',
      pkg_annual_rank_col : 'GHGE_perkg_annual_rank',
      min_col             : 'GHGE_annual_min',
      max_col             : 'GHGE_annual_max',
      pkg_min_col         : 'GHGE_perkg_annual_min',
      pkg_max_col         : 'GHGE_perkg_annual_max',
      pkg_max_abs_dev_col : 'GHGE_perkg_max_abs_dev',
      mean_col            : 'GHGE_annual_mean',
      pkg_mean_col        : 'GHGE_perkg_annual_mean',
      share_col           : 'GHGE_annual_share',
      pct_col             : 'GHGE_pct_from_annual_mean',
      pkg_pct_col         : 'GHGE_perkg_pct_from_annual_mean',
      label               : 'GHGE Sales Footprint (kg CO\u2082-eq/day)',
      pkg_label           : 'GHGE per kg sold (kg CO\u2082-eq/kg)',
      short               : 'GHGE',
      unit                : 'kg CO\u2082-eq/day',
      pkg_unit            : 'kg CO\u2082-eq/kg',
      interpolator        : d3.interpolateYlGn,
      pkg_interpolator    : function (t) {
        return t < 0.5
          ? d3.interpolateRgb('#f4baf6', '#ffffff')(t * 2)
          : d3.interpolateRgb('#ffffff', '#2ca02c')((t - 0.5) * 4);
      },
    },
    LU: {
      weekly_col          : 'LU_weekly_mean',
      weekly_pkg_col      : 'LU_perkg_weekly_mean',
      weekly_rank_col     : 'LU_weekly_rank',
      annual_rank_col     : 'LU_annual_rank',
      pkg_annual_rank_col : 'LU_perkg_annual_rank',
      min_col             : 'LU_annual_min',
      max_col             : 'LU_annual_max',
      pkg_min_col         : 'LU_perkg_annual_min',
      pkg_max_col         : 'LU_perkg_annual_max',
      pkg_max_abs_dev_col : 'LU_perkg_max_abs_dev',
      mean_col            : 'LU_annual_mean',
      pkg_mean_col        : 'LU_perkg_annual_mean',
      share_col           : 'LU_annual_share',
      pct_col             : 'LU_pct_from_annual_mean',
      pkg_pct_col         : 'LU_perkg_pct_from_annual_mean',
      label               : 'Land Use Sales Footprint (m\u00b2\u00b7yr/day)',
      pkg_label           : 'Land Use per kg sold (m\u00b2\u00b7yr/kg)',
      short               : 'Land Use',
      unit                : 'm\u00b2\u00b7yr/day',
      pkg_unit            : 'm\u00b2\u00b7yr/kg',
      interpolator        : d3.interpolateYlOrBr,
      pkg_interpolator    : function (t) {
        return t < 0.5
          ? d3.interpolateRgb('#a9d8e9', '#ffffff')(t * 2)
          : d3.interpolateRgb('#ffffff', '#ff7f0e')((t - 0.5) * 4);
      },
    },
    WU: {
      weekly_col          : 'WU_weekly_mean',
      weekly_pkg_col      : 'WU_perkg_weekly_mean',
      weekly_rank_col     : 'WU_weekly_rank',
      annual_rank_col     : 'WU_annual_rank',
      pkg_annual_rank_col : 'WU_perkg_annual_rank',
      min_col             : 'WU_annual_min',
      max_col             : 'WU_annual_max',
      pkg_min_col         : 'WU_perkg_annual_min',
      pkg_max_col         : 'WU_perkg_annual_max',
      pkg_max_abs_dev_col : 'WU_perkg_max_abs_dev',
      mean_col            : 'WU_annual_mean',
      pkg_mean_col        : 'WU_perkg_annual_mean',
      share_col           : 'WU_annual_share',
      pct_col             : 'WU_pct_from_annual_mean',
      pkg_pct_col         : 'WU_perkg_pct_from_annual_mean',
      label               : 'Water Use Sales Footprint (L/day)',
      pkg_label           : 'Water Use per kg sold (L/kg)',
      short               : 'Water Use',
      unit                : 'L/day',
      pkg_unit            : 'L/kg',
      interpolator        : d3.interpolateYlGnBu,
      pkg_interpolator    : function (t) {
        return t < 0.5
          ? d3.interpolateRgb('#f6b4d1', '#ffffff')(t * 2)
          : d3.interpolateRgb('#ffffff', '#88bced')((t - 0.5) * 8);
      },
    },
  };

  const METRIC_OPTIONS = [
    { key: 'GHGE', display: 'GHGE (Greenhouse Gas Emissions)' },
    { key: 'LU',   display: 'LU (Land Use)'                   },
    { key: 'WU',   display: 'WU (Water Use)'                  },
  ];

  // Row gap per N. Zero gap for 10, increasing gaps for larger sets.
  const CAT_GAPS = { 10: 0, 15: 3, 30: 5};

  // Event dates match 2023 dummy data.
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

  const CAT_OPTIONS = [10, 15, 30];

  let activeMetric     = 'GHGE';
  let activeN          = 15;
  let activePkg        = false;
  let activeEventGroup = 'public_holidays';


  /* 1b. PARSE
  Builds lookup Maps from the flat weeklyData array.
  weeklyMap: cat -> week_start -> row  for fast cell lookups.
  annualRef: cat -> first row, which carries all annual_* fields.
  allWeekStrs is sorted so column order is always chronological.

  To change:
  - The column names used to build the maps are not hardcoded
    here - they come from METRICS above.
  - If the JSON key for the category label changes from
    lcfs_cat, update the .map(r => r.lcfs_cat) references. */

  const parseDate = d3.timeParse('%Y-%m-%d');
  const fmtDate   = d3.timeFormat('%d %b %Y');
  const fmtMonth  = d3.timeFormat('%b');
  const fmtInput  = d3.timeFormat('%Y-%m-%d');

  const allCats = Array.from(new Set(weeklyData.map(function (r) {
    return r.lcfs_cat;
  })));

  const weeklyMap = new Map();
  const annualRef = new Map();
  allCats.forEach(function (cat) { weeklyMap.set(cat, new Map()); });

  weeklyData.forEach(function (r) {
    if (!weeklyMap.has(r.lcfs_cat)) return;
    weeklyMap.get(r.lcfs_cat).set(r.week_start, r);
    if (!annualRef.has(r.lcfs_cat)) annualRef.set(r.lcfs_cat, r);
  });

  const allWeekStrs = Array.from(
    new Set(weeklyData.map(function (r) { return r.week_start; }))
  ).sort();

  const dateMinStr = allWeekStrs[0];
  const dateMaxStr = allWeekStrs[allWeekStrs.length - 1];

  const weekMonthMap = new Map();
  weeklyData.forEach(function (r) {
    if (!weekMonthMap.has(r.week_start))
      weekMonthMap.set(r.week_start, r.calendar_month);
  });

  // Jan-01 anchored week start - mirrors Python get_week_start()
  function getJanAnchoredWeekStart(date) {
    const jan1      = new Date(date.getFullYear(), 0, 1);
    jan1.setHours(0, 0, 0, 0);
    const dayOfYear = Math.floor((date - jan1) / 86400000);
    return new Date(jan1.getTime() + Math.floor(dayOfYear / 7) * 7 * 86400000);
  }

  /* 1c. HELPERS
  Row geometry functions and value formatters.
  computeRowYStarts() returns an array of y positions for
  each category row, accounting for row gaps and group gaps.
  findRowIdx() maps a mouse y-coordinate back to a row index.
  valFormatter uses explicit math to avoid d3 SI rounding.

  To change:
  - Row group gap size: update CAT_GAPS in 1a.
  - Number format precision: edit the d3.format strings. */

  function computeRowYStarts(N, ROW_H, groupGapPx) {
    var y = 0;
    return Array.from({ length: N }, function (_, i) {
      var start = y;
      y += ROW_H + LAYOUT.GAP;
      if ((i + 1) % LAYOUT.ROW_GROUP_SIZE === 0 && i < N - 1)
        y += groupGapPx;
      return start;
    });
  }

  function findRowIdx(my, rowYStarts, ROW_H) {
    for (var i = 0; i < rowYStarts.length; i++) {
      if (my >= rowYStarts[i] && my < rowYStarts[i] + ROW_H) return i;
    }
    return -1;
  }

  function valFormatter(v) {
    if (v == null || isNaN(v)) return '\u2014';
    var abs = Math.abs(v);
    if (abs >= 1e9) return d3.format('.2f')(v / 1e9) + ' billion';
    if (abs >= 1e6) return d3.format('.2f')(v / 1e6) + ' million';
    if (abs >= 1e3) return d3.format('.0f')(v / 1e3) + 'K';
    if (abs >= 10)  return d3.format('.1f')(v);
    return d3.format('.2f')(v);
  }

  function pctFormatter(v) {
    if (v == null || isNaN(v)) return '\u2014';
    return (v >= 0 ? '+' : '') + d3.format('.1f')(v) + '%';
  }

  function statFmt(v) {
    if (v == null || isNaN(v)) return '-';
    var abs = Math.abs(v);
    if (abs >= 1e6) return d3.format('.2f')(v / 1e6) + ' million';
    if (abs >= 1e3) return d3.format('.0f')(v / 1e3) + 'K';
    if (abs >= 10)  return d3.format('.1f')(v);
    return d3.format('.2f')(v);
  }

  // Grand annual means across all categories - used in legend block
  const grandAnnualSF  = {};
  const grandAnnualPkg = {};
  Object.keys(METRICS).forEach(function (m) {
    var mcfg = METRICS[m];
    var sfSum = 0, pkgSum = 0, n = 0;
    allCats.forEach(function (cat) {
      var ref = annualRef.get(cat);
      if (!ref) return;
      sfSum  += ref[mcfg.mean_col]     || 0;
      pkgSum += ref[mcfg.pkg_mean_col] || 0;
      n++;
    });
    grandAnnualSF[m]  = sfSum;
    grandAnnualPkg[m] = n > 0 ? pkgSum / n : 0;
  });


  /* 1d. CONTROLS
     HTML controls built via D3 append inside
     ctrlWrapper (position: relative so legend block can anchor
     to its top-right corner). topRow holds metric, per-kg,
     category count, and legend block. ctrlRow holds event
     overlay, date pickers, and reset.

     Context paragraph removed - instructions live in the About
     page and the sidebar how-to block.

     To change:
     - Category count options: update CAT_OPTIONS in 1a.
     - Control font size: edit font-size style calls below.
     - Legend threshold (narrow vs wide): adjust 520 in the
       ResizeObserver (section 1h) - same value as trend chart. */

  const container = d3.create('div')
    .style('font-family', 'sans-serif')
    .style('position', 'relative');

  // Static heading - never changes with metric or toggle state
  container.append('div')
    .style('font-size', '20px')
    .style('font-weight', '700')
    .style('color', '#222')
    .style('margin-bottom', '6px')
    .text('Seasonal Variations in Environmental Impacts from Categories');

  // Static description - mirrors the about page summary
  container.append('div')
    .style('font-size', '12px')
    .style('color', '#777')
    .style('line-height', '1.6')
    .style('margin-bottom', '14px')
    .text(
      'Use this chart to explore how the environmental impact of specific food and drink categories varies throughout the year.'+
      'The cell colour indicates how much the category has deviated from the category average. '+
      'You should only compare colours WITHIN a row, not between rows. '
    );

  // position: relative anchors the absolute legend block.
  // display: flex with column direction enforces the visual stack order:
  //   topRow (controls, may wrap) -> hmLegendBlock -> ctrlRow
  // When hmLegendBlock switches to position: relative on narrow screens
  // it re-enters flow between topRow and ctrlRow exactly as intended.
  const ctrlWrapper = container.append('div')
    .style('position', 'relative')
    .style('display', 'flex')
    .style('flex-direction', 'column');

  // flex-wrap: wrap allows the metric dropdown, per-kg pill, and show-N
  // dropdown to break onto a second line when there is not enough room.
  // padding-right reserves space for the absolute legend block on wide
  // screens. applyLegendLayout() sets this to 0 on narrow screens when
  // the legend drops into normal flow below the controls instead.
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
      activeMetric = d3.select(this).property('value');
      redraw();
    });

  METRIC_OPTIONS.forEach(function (opt) {
    metricSelect.append('option')
      .attr('value', opt.key)
      .property('selected', opt.key === activeMetric)
      .text(opt.display);
  });

  topRow.append('div')
    .style('width', '1px').style('height', '18px')
    .style('background', '#ddd').style('margin', '0 4px');

  const pkgPill = topRow.append('div')
    .style('display', 'flex').style('border', '1px solid #ccc')
    .style('border-radius', '4px').style('overflow', 'hidden');

  const btnTotal = pkgPill.append('button').text('Total SF')
    .style('font-size', '12px').style('padding', '4px 10px')
    .style('border', 'none').style('cursor', 'pointer')
    .style('font-family', 'inherit')
    .style('transition', 'background 0.15s, color 0.15s');

  const btnPkg = pkgPill.append('button').text('Per kg')
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
    if (activePkg)  { activePkg = false; syncPkgToggle(); redraw(); }
  });
  btnPkg.on('click', function () {
    if (!activePkg) { activePkg = true;  syncPkgToggle(); redraw(); }
  });
  syncPkgToggle();

  topRow.append('div')
    .style('width', '1px').style('height', '18px')
    .style('background', '#ddd').style('margin', '0 4px');

  topRow.append('span')
    .style('font-size', '12px').style('color', '#666')
    .text('Show:');

  const catSelect = topRow.append('select')
    .style('font-size', '12px').style('padding', '4px 8px')
    .style('border-radius', '4px').style('border', '1px solid #ccc')
    .style('background', 'white').style('cursor', 'pointer')
    .on('change', function () {
      activeN = +d3.select(this).property('value');
      redraw();
    });

  CAT_OPTIONS.forEach(function (n) {
    catSelect.append('option')
      .attr('value', n).property('selected', n === activeN)
      .text('Top ' + n + ' categories');
  });

  // Legend block: absolute top-right of ctrlWrapper.
  // Same repositioning logic as trend chart - drops below controls
  // when chart width falls below 520px (handled in ResizeObserver).
  const hmLegendBlock = ctrlWrapper.append('div')
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

  const hmSwatchRow = hmLegendBlock.append('div')
    .style('display', 'flex').style('align-items', 'center').style('gap', '8px');

  const hmLegendSwatch = hmSwatchRow.append('svg')
    .attr('width', '28').attr('height', '10').style('flex-shrink', '0');

  hmLegendSwatch.append('line')
    .attr('x1', '0').attr('y1', '5').attr('x2', '28').attr('y2', '5')
    .attr('stroke-width', '2.5').attr('stroke-linecap', 'round')
    .attr('class', 'hm-legend-line');

  const hmLegendLabel = hmSwatchRow.append('span')
    .style('font-size', '12px').style('color', '#555');

  // Annual mean values: bold per change spec
  const hmLegendMeanSF = hmLegendBlock.append('span')
    .style('font-size', '10px').style('color', '#444');

  const hmLegendMeanPkg = hmLegendBlock.append('span')
    .style('font-size', '10px').style('color', '#444');

  // Bottom row: event overlay + dates + reset
  const ctrlRow = ctrlWrapper.append('div')
    .style('display', 'flex')
    .style('align-items', 'center')
    .style('column-gap', '10px').style('row-gap', '8px')
    .style('flex-wrap', 'wrap')
    // .style('margin-top', '12px')
    .style('margin-bottom', '12px');

  ctrlRow.append('span')
    .style('font-size', '12px').style('color', '#666')
    .text('Event overlay:');

  const eventGroupSelect = ctrlRow.append('select')
    .style('font-size', '12px').style('padding', '4px 8px')
    .style('border-radius', '4px').style('border', '1px solid #ccc')
    .style('background', 'white').style('cursor', 'pointer')
    .on('change', function () {
      activeEventGroup = d3.select(this).property('value');
      redraw();
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
    .style('font-size', '12px').style('color', '#666').text('From:');

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
    .style('font-size', '12px').style('color', '#666').text('To:');

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
    var atFull =
      startPicker.property('value') === dateMinStr &&
      endPicker.property('value')   === dateMaxStr;
    resetBtn
      .attr('disabled',        atFull ? true : null)
      .style('opacity',        atFull ? '0.35' : '1')
      .style('cursor',         atFull ? 'not-allowed' : 'pointer')
      .style('pointer-events', atFull ? 'none' : 'auto');
  }


  /* 1e. GRADIENT LEGEND
     HTML div containing a small inline SVG with the
     colour scale gradient bar and its labels. Sits between the
     controls and the chart (above the sticky header area) so it
     is always visible without scrolling. The gradient definition
     lives in this SVG's own defs element. redraw() updates the
     gradient stops, the title text, and the end labels.

     To change:
     - Legend width: update the SVG width attribute and the
       gradRect width attribute to match.
     - Label font size: edit the style calls on gradLeft etc.
     - Remove the legend entirely: delete this section and its
       update calls in redraw(). No other code depends on it. */

  // gradLegendDiv appended to hmLegendBlock so it sits below the annual
  // mean spans and stays right-aligned on wide screens, left-aligned on narrow.
  // margin-top adds breathing space between the mean spans and the colour bar.

  // Gradient legend moved back into bodySVG axisLegGroup (bottom-right band).
  // lgGrad defs are added to bodySVG in section 1f so the gradient ID resolves
  // within the same SVG document. legG is drawn in redraw() since its y position
  // depends on chart_H which changes with activeN.


  /* 1f. SVG SHELL
     Two SVG elements stacked inside scrollWrapper.

     headerSVG (sticky): contains month labels and event markers.
       position: sticky means it stays pinned at the top of the
       right-panel viewport as the user scrolls down the heatmap.
       The hg group is translated by (MARGIN.left, MARGIN.top) so
       month labels at y=-N and event ticks at y=-N render in the
       visible space above the cell boundary at y=0.

     bodySVG (scrolls): contains cells, category labels, rank
       axis, dividers, and the overlay rect. Its height updates
       in redraw() each time chart_H changes (activeN change).
       No top margin needed here - the header is a separate element.

     Both SVGs share the same MARGIN.left so colX() values align
     between them visually despite being in separate DOM elements.

     To change:
     - Sticky header background: update background on stickyHeader.
     - Sticky top offset: change the top value on stickyHeader.
       0 sticks to the top of the right-panel viewport. If the
       nav bar overlaps, try top: 48px - but normally the nav is
       outside the right-panel scroll context so 0 is correct.
     - Header height (space for month labels and event ticks):
       update LAYOUT.HEADER_H in 1a and LAYOUT.MARGIN.top to match. */

  // stickyHeader sits outside hmChartScroll so overflow-x: auto on the
  // scroll container does not trap sticky positioning.
  // It sticks relative to right-panel (the actual vertical scroll ancestor).
  // A scroll listener below keeps header content aligned with body scroll.
  const stickyHeader = container.append('div')
    .style('position', 'sticky')
    .style('top', '0')
    .style('z-index', '10')
    .style('background', '#ffffff')
    .style('overflow', 'hidden');   // clips header content that scrolls past edge

  const headerSVG = stickyHeader.append('svg')
    .attr('width', totalWidth)
    .attr('height', LAYOUT.HEADER_H)
    .style('overflow', 'visible')
    .style('display', 'block');

  // hg transform: MARGIN.left offset updated by scroll listener when body scrolls
  const hg = headerSVG.append('g')
    .attr('transform', 'translate(' + MARGIN.left + ',' + LAYOUT.HEADER_H + ')');

  // hmChartScroll: horizontal scroll only, overflow-y visible so sticky is unaffected
  const hmChartScroll = container.append('div')
    .style('overflow-x', 'auto')
    .style('overflow-y', 'visible');

  const scrollWrapper = hmChartScroll.append('div')
    .style('min-width', MIN_CHART_WIDTH + 'px')
    .style('position', 'relative');

  const monthGroup = hg.append('g').attr('class', 'months');
  const eventGroup = hg.append('g').attr('class', 'events');

  // Bottom border of header separating it from the body
  const headerBaseline = hg.append('line')
    .attr('x1', -MARGIN.left).attr('x2', W)
    .attr('y1', -1).attr('y2', -1)
    .attr('stroke', '#e0e0e0').attr('stroke-width', 0.5);

  const bodySVG = scrollWrapper.append('svg')
    .attr('width', totalWidth)
    .attr('height', 270)   // initial placeholder; updated in redraw()
    .style('overflow', 'visible')
    .style('display', 'block');

  // Gradient defs live in bodySVG so url(#hm-v3-legend-grad) resolves
  // within the same SVG document as the legend rect that references it.
  const bodyDefs = bodySVG.append('defs');
  const lgGrad   = bodyDefs.append('linearGradient')
    .attr('id', 'hm-v3-legend-grad')
    .attr('x1', '0%').attr('x2', '100%');

  // Body g group: no top margin since header is a separate element
  const g = bodySVG.append('g')
    .attr('transform', 'translate(' + MARGIN.left + ',0)');

  const dividerGroup = g.append('g').attr('class', 'dividers');
  const cellGroup    = g.append('g').attr('class', 'cells');
  const labelGroup   = g.append('g').attr('class', 'cat-labels');
  const rankGroup    = g.append('g').attr('class', 'rank-axis');
  const axisLegGroup = g.append('g').attr('class', 'axis-leg');

  const overlay = g.append('rect')
    .attr('width', W).attr('height', 270)
    .attr('fill', 'none').style('pointer-events', 'all');

  // Cell tooltip positioned relative to container
  const tooltip = container.append('div')
    .style('position', 'absolute').style('pointer-events', 'none')
    .style('background', 'rgba(255,255,255,0.97)')
    .style('border', '1px solid #ccc').style('border-radius', '6px')
    .style('padding', '8px 12px').style('font-size', '12px')
    .style('line-height', '1.8')
    .style('box-shadow', '0 2px 8px rgba(0,0,0,0.12)')
    .style('display', 'none').style('max-width', '280px')
    .style('z-index', '20');

  // Shared tooltip for event marker hover and rank strip hover
  const evtTooltip = container.append('div')
    .style('position', 'absolute').style('pointer-events', 'none')
    .style('background', 'rgba(255,255,255,0.97)')
    .style('border', '1px solid #ddd').style('border-radius', '5px')
    .style('padding', '5px 9px').style('font-size', '12px')
    .style('line-height', '1.5')
    .style('box-shadow', '0 1px 6px rgba(0,0,0,0.10)')
    .style('display', 'none').style('max-width', '200px')
    .style('z-index', '21');

  // Footnote inside hmChartScroll so it scrolls horizontally with the chart.
  const footnoteEl = hmChartScroll.append('p')
    .style('font-size', '12px').style('color', '#767676')
    .style('white-space', 'nowrap')
    .style('margin', '10px 0 6px 0').style('min-height', '16px')
    .html(EVENT_FOOTNOTES['public_holidays'] || '');


  /* 1g. REDRAW
     Full chart redraw on any state or resize change.
     Clears and redraws all groups in both headerSVG and bodySVG.
     chart_H is computed from activeN and updates bodySVG height.
     colX() uses effectiveCellW and month gap offsets to map
     a column index to an x pixel position. The same colX()
     function is used in both header and body groups so month
     label positions align with cell column positions.

     To change:
     - Colour scheme: update interpolator/pkg_interpolator in 1a.
     - Row height formula: chart_H computation uses (N-10)/55 -
       update if CAT_OPTIONS changes maximum from 65 to 30.
     - Tooltip content: edit the html() template string below. */

  function redraw() {
    console.log('L2a first week_start raw:', allWeekStrs[0], '| parsed:', parseDate(allWeekStrs[0]));

    [monthGroup, eventGroup, dividerGroup, cellGroup,
     labelGroup, rankGroup, axisLegGroup].forEach(function (grp) {
      grp.selectAll('*').remove();
    });

    var cfg = METRICS[activeMetric];

    var activeInterp     = cfg.interpolator;
    var activeLabel      = activePkg ? cfg.pkg_label          : cfg.label;
    var activeUnit       = activePkg ? cfg.pkg_unit           : cfg.unit;
    var activeAnnRankCol = activePkg ? cfg.pkg_annual_rank_col : cfg.annual_rank_col;
    var activeMeanCol    = activePkg ? cfg.pkg_mean_col       : cfg.mean_col;
    var activePctCol     = activePkg ? cfg.pkg_pct_col        : cfg.pct_col;
    var activeWkCol      = activePkg ? cfg.weekly_pkg_col     : cfg.weekly_col;
    var activeDivCol     = cfg.pkg_max_abs_dev_col;

    var dFrom = new Date(startPicker.property('value') + 'T00:00:00');
    var dTo   = new Date(endPicker.property('value')   + 'T00:00:00');

    var sortedCats = allCats.slice().sort(function (a, b) {
      var ra = (annualRef.get(a) || {})[activeAnnRankCol] || 99;
      var rb = (annualRef.get(b) || {})[activeAnnRankCol] || 99;
      return ra - rb;
    }).slice(0, activeN);

    var N_CATS     = sortedCats.length;
    var groupGapPx = CAT_GAPS[activeN] || 0;
    var nGroupGaps = Math.floor((N_CATS - 1) / LAYOUT.ROW_GROUP_SIZE);
    var chart_H    = LAYOUT.MIN_CHART_H +
                     ((N_CATS - 10) / 20) * (LAYOUT.MAX_CHART_H - LAYOUT.MIN_CHART_H);
    var available  = chart_H - (N_CATS - 1) * LAYOUT.GAP - nGroupGaps * groupGapPx;
    var ROW_H      = Math.max(available / N_CATS, LAYOUT.MIN_ROW_H);
    var rowYStarts = computeRowYStarts(N_CATS, ROW_H, groupGapPx);

    // Update body SVG and overlay height to match computed chart_H
    bodySVG.attr('height', chart_H + MARGIN.bottom);
    overlay.attr('height', chart_H);

    const weekKeys = allWeekStrs.filter(function (wk) {
      const wd = parseDate(wk);
      if (!wd) return false;  // null guard: skip if date format did not match
      const we = new Date(wd.getTime() + 6 * 86400000);
      return wd <= dTo && we >= dFrom;
    });

    var displayDates = weekKeys.map(function (s) { return parseDate(s); });

    var displayValues = new Map();
    sortedCats.forEach(function (cat) {
      var wkMap = weeklyMap.get(cat);
      var m     = new Map();
      weekKeys.forEach(function (wk) {
        var row = wkMap && wkMap.get(wk);
        if (row && row[activeWkCol] != null)
          m.set(wk, {
            value    : row[activeWkCol],
            rank     : row[cfg.weekly_rank_col],
            share    : row[cfg.share_col],
            pct      : row[activePctCol],
            ann_mean : row[activeMeanCol],
          });
      });
      displayValues.set(cat, m);
    });

    var N_COLS = displayDates.length;
    if (!N_COLS) return;

    // Month gap columns: insert before bins that contain a month-1st
    var monthStartCols = new Set();
    displayDates.forEach(function (d, i) {
      if (i === 0 || !d) return;  // null guard: skip null dates
      for (var offset = 0; offset < 7; offset++) {
        const day = new Date(d.getTime() + offset * 86400000);
        if (day.getDate() === 1) { monthStartCols.add(i); break; }
      }
    });

    var effectiveCellW = (W - monthStartCols.size * LAYOUT.MONTH_GAP) / N_COLS;

    var colGapOffset = new Array(N_COLS).fill(0);
    var cumGaps = 0;
    for (var ci = 0; ci < N_COLS; ci++) {
      if (monthStartCols.has(ci)) cumGaps++;
      colGapOffset[ci] = cumGaps;
    }

    function colX(colIdx) {
      return colIdx * effectiveCellW + (colGapOffset[colIdx] || 0) * LAYOUT.MONTH_GAP;
    }

    // Period baseline stats (passed to onStats if provided)
    var periodSFTotal  = 0, periodPkgSum = 0, periodPkgCount = 0;
    allCats.forEach(function (cat) {
      var wm = weeklyMap.get(cat);
      weekKeys.forEach(function (wk) {
        var row = wm && wm.get(wk);
        if (!row) return;
        if (row[cfg.weekly_col] != null && !isNaN(row[cfg.weekly_col]))
          periodSFTotal += row[cfg.weekly_col];
        if (row[cfg.weekly_pkg_col] != null && !isNaN(row[cfg.weekly_pkg_col])) {
          periodPkgSum += row[cfg.weekly_pkg_col];
          periodPkgCount++;
        }
      });
    });
    var periodPkgAvg = periodPkgCount > 0 ? periodPkgSum / periodPkgCount : 0;
    if (typeof onStats === 'function') onStats(periodSFTotal, periodPkgAvg, cfg);

    // Gradient legend: SVG group in axisLegGroup, bottom-right of chart.
    // Position anchored to W and chart_H so it stays in the bottom-right
    // corner regardless of how many category rows are visible.
    // Adjust the x offset (W - 155) to nudge left or right.
    // Adjust the y offset (chart_H + 14) to raise or lower within MARGIN.bottom.
    lgGrad.selectAll('stop').remove();
    d3.range(0, 1.01, 0.1).forEach(function (t) {
      lgGrad.append('stop')
        .attr('offset', (t * 100) + '%')
        .attr('stop-color', activePkg ? cfg.pkg_interpolator(t) : activeInterp(t));
    });

    var LEG_W = 250;
    var legG = axisLegGroup.append('g')
      .attr('transform', 'translate(' + (W + 15 - LEG_W) + ',' + (chart_H + 20) + ')');

    legG.append('text').attr('x', 0).attr('y', 5)
      .style('font-size', '9px').style('fill', '#999')
      .text(activePkg ? 'Deviation from annual mean:' : 'Per-row scale:');

    legG.append('rect')
      .attr('y', 10).attr('width', LEG_W).attr('height', 10).attr('rx', 2)
      .style('fill', 'url(#hm-v3-legend-grad)');

    if (activePkg) {
      legG.append('text').attr('x', 0).attr('y', 30)
        .style('font-size', '9px').style('fill', '#767676').text('Below mean');
      legG.append('text').attr('x', LEG_W / 2).attr('y', 30)
        .attr('text-anchor', 'middle')
        .style('font-size', '9px').style('fill', '#767676').text('Annual mean');
      legG.append('text').attr('x', LEG_W).attr('y', 30)
        .attr('text-anchor', 'end')
        .style('font-size', '9px').style('fill', '#767676').text('Above mean');
    } else {
      legG.append('text').attr('x', 0).attr('y', 30)
        .style('font-size', '9px').style('fill', '#767676').text('Low');
      legG.append('text').attr('x', LEG_W).attr('y', 30)
        .attr('text-anchor', 'end')
        .style('font-size', '9px').style('fill', '#767676').text('High');
    }

    // Per-category colour scales
    var rowScales = new Map();
    sortedCats.forEach(function (cat) {
      var ref = annualRef.get(cat) || {};
      if (activePkg) {
        var mean     = ref[activeMeanCol]  || 0;
        var halfSpan = ref[activeDivCol]   || 1;
        rowScales.set(cat,
          d3.scaleDiverging(cfg.pkg_interpolator)
            .domain([mean - halfSpan * 1.5, mean, mean + halfSpan * 1.5])
            .clamp(true)
        );
      } else {
        var vals = Array.from((displayValues.get(cat) || new Map()).values())
          .map(function (d) { return d.value; })
          .filter(function (v) { return v != null && !isNaN(v); });
        var ext  = d3.extent(vals);
        var vMin = ext[0] || 0, vMax = ext[1] || 1;
        rowScales.set(cat,
          d3.scaleSequential(activeInterp).domain([vMin, vMax]).clamp(true)
        );
      }
    });

    // Update header baseline width for current W
    headerBaseline.attr('x2', W);

    // Month labels in headerSVG (y values are negative, above cell boundary)
    var monthsDrawn = new Set();

    if (displayDates.length) {
      var firstMonth = displayDates[0].getMonth();
      monthGroup.append('text')
        .attr('x', colX(0)).attr('y', -LAYOUT.HEADER_H + 35)
        .attr('text-anchor', 'start')
        .style('font-size', '9px').style('fill', '#555').style('font-weight', '600')
        .text(fmtMonth(displayDates[0]));
      monthsDrawn.add(firstMonth);
    }

    monthStartCols.forEach(function (colIdx) {
      if (!displayDates[colIdx]) return;  // null guard
      var monthDate = null;
      for (var offset = 0; offset < 7; offset++) {
        var day = new Date(displayDates[colIdx].getTime() + offset * 86400000);
        if (day.getDate() === 1) { monthDate = day; break; }
      }
      if (!monthDate) return;
      var mo = monthDate.getMonth();
      if (monthsDrawn.has(mo)) return;
      monthsDrawn.add(mo);

      var x1 = colX(colIdx);
      monthGroup.append('text')
        .attr('x', x1).attr('y', -LAYOUT.HEADER_H + 35)
        .attr('text-anchor', 'start')
        .style('font-size', '9px').style('fill', '#555').style('font-weight', '600')
        .text(fmtMonth(monthDate));

      // Month divider in body only (vertical line from y=0 to y=chart_H)
      dividerGroup.append('line')
        .attr('x1', x1).attr('x2', x1)
        .attr('y1', 0).attr('y2', chart_H)
        .attr('stroke', '#e0e0e0').attr('stroke-width', 0.5);
    });

    // Event markers in headerSVG - sticky, always visible above cells
    // Tick y values are negative (above cell boundary at y=0 in hg coords)
    var activeEvents = EVENTS_BY_GROUP[activeEventGroup] || [];
    activeEvents.forEach(function (evt) {
      var evtDate = parseDate(evt.date);
      if (!evtDate || evtDate < dFrom || evtDate > dTo) return;

      var weekStartDate = getJanAnchoredWeekStart(evtDate);
      var weekStartStr  = fmtInput(weekStartDate);
      var idx = displayDates.findIndex(function (d) {
        return d && fmtInput(d) === weekStartStr;  // null guard on d
      });
      if (idx < 0) return;

      var dayOffset = Math.floor((evtDate - weekStartDate) / 86400000);
      var ex        = colX(idx) + (dayOffset + 0.5) / 7 * effectiveCellW;

      var markerG = eventGroup.append('g')
        .attr('class', 'event-marker')
        .style('cursor', 'pointer');

      // Invisible enlarged hover area around the tick and dot
      markerG.append('rect')
        .attr('x', ex - 8).attr('y', -16)
        .attr('width', 16).attr('height', 16)
        .attr('fill', 'transparent');

      // Short solid tick above cell boundary.
      // y1 controls how far the line extends above the dot at y2.
      // Increase y1 (e.g. -14 or -10) for a shorter line.
      // Decrease y1 (e.g. -26 or -30) for a longer line.
      markerG.append('line')
        .attr('x1', ex).attr('x2', ex)
        .attr('y1', -10)
        .attr('y2', 0)
        .attr('stroke', '#aaa').attr('stroke-width', 2);

      // Dot at the cell boundary
      markerG.append('circle')
        .attr('cx', ex).attr('cy', -6)
        .attr('r', 3).attr('fill', '#aaa');

      // Label text removed: dot and line only. Event name shown in tooltip.
      markerG
        .on('mouseover', function (event) {
          tooltip.style('display', 'none');
          evtTooltip.style('display', null).html(
            '<div style="font-weight:600;color:#888;margin-bottom:2px">' +
            evt.label + '</div>' +
            '<div style="color:#555">' + fmtDate(evtDate) + '</div>'
          );
          var cRect   = container.node().getBoundingClientRect();
          var tipW    = 190;
          var cursorX = event.clientX - cRect.left;
          // Flip right if there is room, otherwise flip left.
          // Prevents clipping at the left edge (near sidebar) and
          // at the right edge of the chart container.
          var openRight = cursorX + tipW + 15 < cRect.width;
          evtTooltip
            .style('left', (openRight
              ? cursorX + 10
              : cursorX - tipW - 10) + 'px')
            .style('top', (event.clientY - cRect.top - 40) + 'px');
        })
        .on('mouseleave', function () { evtTooltip.style('display', 'none'); });
    });

    footnoteEl.html(EVENT_FOOTNOTES[activeEventGroup] || '');

    // Row group horizontal dividers in body
    sortedCats.forEach(function (_, i) {
      if (groupGapPx > 0 && (i + 1) % LAYOUT.ROW_GROUP_SIZE === 0 && i < N_CATS - 1) {
        var divY = rowYStarts[i] + ROW_H + LAYOUT.GAP + groupGapPx / 2;
        dividerGroup.append('line')
          .attr('x1', -4).attr('x2', W)
          .attr('y1', divY).attr('y2', divY)
          .attr('stroke', '#eaeaea').attr('stroke-width', 0.5)
          .attr('stroke-dasharray', '2,2');
      }
    });

    // Category labels
    var labelFontSize = Math.min(11, Math.max(7, ROW_H * 0.38)) + 'px';
    sortedCats.forEach(function (cat, i) {
      var cy = rowYStarts[i] + ROW_H / 2;
      labelGroup.append('text')
        .attr('x', -6).attr('y', cy)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'central')
        .style('font-size', labelFontSize).style('fill', '#444')
        .style('cursor', 'default')
        .text(cat.length > 26 ? cat.slice(0, 25) + '\u2026' : cat)
        .on('mouseover', function (event) {
          tooltip.style('display', 'none');
          evtTooltip.style('display', null).html(
            '<div style="font-weight:600;color:#555">' + cat + '</div>'
          );
          var cRect = container.node().getBoundingClientRect();
          evtTooltip
            .style('left', (event.clientX - cRect.left + 12) + 'px')
            .style('top',  (event.clientY - cRect.top  - 30) + 'px');
        })
        .on('mouseleave', function () { evtTooltip.style('display', 'none'); });
    });

    // Y-axis label
    axisLegGroup.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('x', -chart_H / 2).attr('y', -MARGIN.left + 10)
      .attr('text-anchor', 'middle')
      .style('font-size', '11px').style('fill', '#666')
      .text('Product categories (ranked by impact)');

    // Rank axis header with hover hint
    rankGroup.append('text')
      .attr('x', W + 24).attr('y', -8)
      .attr('text-anchor', 'middle')
      .style('font-size', '9px').style('fill', '#999').style('font-weight', '600')
      .style('cursor', 'default').text('Rank')
      .on('mouseover', function (event) {
        evtTooltip.style('display', null).html(
          '<div style="font-size:11px;color:#555;line-height:1.5">' +
          'Rank 1 = highest impact<br>Rank ' + allCats.length + ' = lowest impact</div>'
        );
        var cRect = container.node().getBoundingClientRect();
        evtTooltip
          .style('left', (event.clientX - cRect.left - 185) + 'px')
          .style('top',  (event.clientY - cRect.top  - 30)  + 'px');
      })
      .on('mouseleave', function () { evtTooltip.style('display', 'none'); });

    // Rank numbers with hover tooltip
    sortedCats.forEach(function (_, i) {
      var rank = i + 1;
      var show = N_CATS <= 30
        ? true
        : (rank === 1 || rank === N_CATS || rank % 5 === 0);
      if (!show) return;
      var cy = rowYStarts[i] + ROW_H / 2;
      rankGroup.append('text')
        .attr('x', W + 24).attr('y', cy)
        .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
        .style('font-size', '8px').style('fill', '#bbb').style('cursor', 'default')
        .text(rank)
        .on('mouseover', function (event) {
          evtTooltip.style('display', null).html(
            '<div style="font-size:11px;color:#555;line-height:1.5">' +
            'Rank 1 = highest impact<br>Rank ' + allCats.length + ' = lowest impact</div>'
          );
          var cRect = container.node().getBoundingClientRect();
          evtTooltip
            .style('left', (event.clientX - cRect.left - 185) + 'px')
            .style('top',  (event.clientY - cRect.top  - 30)  + 'px');
        })
        .on('mouseleave', function () { evtTooltip.style('display', 'none'); });
    });

    // Cells: one g.row-group per category
    var rowGroupEls = [];
    sortedCats.forEach(function (cat, rowIdx) {
      var rowG   = cellGroup.append('g').attr('class', 'row-group');
      rowGroupEls.push(rowG);
      var rowY   = rowYStarts[rowIdx];
      var scale  = rowScales.get(cat);
      var colMap = displayValues.get(cat);

      displayDates.forEach(function (date, colIdx) {
        var key  = fmtInput(date);
        var cell = colMap && colMap.get(key);
        var val  = cell ? cell.value : null;
        var fill = (val != null && !isNaN(val))
          ? scale(val) : LAYOUT.MISSING_FILL;
        rowG.append('rect')
          .attr('x',      colX(colIdx))
          .attr('y',      rowY)
          .attr('width',  Math.max(effectiveCellW - 0.2, 0.5))
          .attr('height', ROW_H)
          .attr('fill',   fill);
      });
    });

    // Cell hover tooltip
    overlay.on('mousemove', function (event) {
      var pointer = d3.pointer(event, this);
      var mx = pointer[0], my = pointer[1];

      var colIdx = -1, minDist = Infinity;
      displayDates.forEach(function (d, i) {
        var cx   = colX(i) + effectiveCellW / 2;
        var dist = Math.abs(mx - cx);
        if (dist < minDist) { minDist = dist; colIdx = i; }
      });

      var rowIdx = findRowIdx(my, rowYStarts, ROW_H);

      if (colIdx < 0 || rowIdx < 0 || minDist > effectiveCellW + LAYOUT.MONTH_GAP) {
        tooltip.style('display', 'none');
        rowGroupEls.forEach(function (rg) { rg.attr('opacity', 1); });
        return;
      }

      rowGroupEls.forEach(function (rg) { rg.attr('opacity', LAYOUT.DIM_OPACITY); });
      rowGroupEls[rowIdx].attr('opacity', 1);

      var date = displayDates[colIdx];
      var cat  = sortedCats[rowIdx];
      var key  = fmtInput(date);
      var cell = displayValues.get(cat) && displayValues.get(cat).get(key);

      if (!cell) { tooltip.style('display', 'none'); return; }

      var pctColour  = cell.pct >= 0 ? '#d62728' : '#2ca02c';
      var rankLabel  = (cell.rank != null) ? cell.rank + ' of ' + allCats.length : '\u2014';

      // Annual share section only shown for Total SF view
      var annualBlock = (!activePkg && cell.share != null)
        ? '<div style="font-size:11px;font-weight:600;color:#888;' +
          'margin-top:5px;border-top:1px solid #eee;padding-top:4px">' +
          'Annual data:</div>' +
          '<div><b>Annual contribution to total SF:</b> ' +
          d3.format('.2f')(cell.share) + '%</div>'
        : '';

      var tipH = 180, tipW = 280;
      var cRect = container.node().getBoundingClientRect();
      var left  = event.clientX - cRect.left + 14;
      var top   = event.clientY - cRect.top;
      var flipUp = top + tipH + 10 > cRect.height;

      tooltip.style('display', null).html(
        '<div style="font-weight:600;color:' + activeInterp(0.7) +
        ';margin-bottom:3px">' +
        cfg.short + ' ' + (activePkg ? 'per kg' : 'Sales Footprint') + '</div>' +
        '<div><b>Week of:</b> ' + fmtDate(date) + '</div>' +
        '<div><b>Category:</b> ' + cat + '</div>' +
        '<div><b>Weekly mean:</b> ' + valFormatter(cell.value) + ' ' + activeUnit + '</div>' +
        '<div style="font-size:11px;font-weight:600;color:#888;' +
        'margin-top:5px;border-top:1px solid #eee;padding-top:4px">' +
        "Week's data:</div>" +
        "<div><b>Week's rank:</b> " + rankLabel + '</div>' +
        '<div><b>Deviation from annual mean:</b> ' +
        '<span style="color:' + pctColour + '">' + pctFormatter(cell.pct) + '</span></div>' +
        annualBlock
      )
        .style('left',
          ((left + tipW > cRect.width ? left - tipW - 24 : left)) + 'px')
        .style('top', (flipUp ? top - tipH - 10 : top + 10) + 'px');
    })
    .on('mouseleave', function () {
      tooltip.style('display', 'none');
      evtTooltip.style('display', 'none');
      rowGroupEls.forEach(function (rg) { rg.attr('opacity', 1); });
    });

    // Legend swatch and bold annual mean values
    hmLegendSwatch.select('.hm-legend-line').attr('stroke', activeInterp(0.7));
    hmLegendLabel
      .style('color', activeInterp(0.7))
      .text(cfg.short + ' - ' + (activePkg ? 'Per kg' : 'Total SF'));

    hmLegendMeanSF.html(
      'Annual mean SF: <b style="font-weight:600">' +
      statFmt(grandAnnualSF[activeMetric]) + ' ' + cfg.unit + '</b>'
    );
    hmLegendMeanPkg.html(
      'Annual mean per kg: <b style="font-weight:600">' +
      statFmt(grandAnnualPkg[activeMetric]) + ' ' + cfg.pkg_unit + '</b>'
    );

    syncResetButton();
  }


  /* 1h. RESIZE
     ResizeObserver on the .chart-section ancestor.
     Fires after 120ms debounce on any width change larger than
     4px. Updates totalWidth, W, both SVG widths, overlay width,
     and header baseline width. Also handles legend repositioning
     below controls on narrow charts (same 520px threshold as
     the trend chart, applied to both legend block and topRow
     padding). Deferred with setTimeout so the node is in the
     DOM before closest() is called.

     To change:
     - Narrow threshold: adjust 520 (same number in trend chart).
     - Debounce delay: adjust 120 (milliseconds).
     - Minimum width: adjust the 320 floor in Math.max(). */

  function computeNarrow(w) { return w < 520; }

  function applyLegendLayout(narrow) {
    hmLegendBlock
      .style('position',    narrow ? 'relative' : 'absolute')
      .style('top',         narrow ? 'auto' : '0')
      .style('right',       narrow ? 'auto' : '0')
      .style('margin-top',  narrow ? '8px'  : '0')
      .style('align-items', narrow ? 'flex-start' : 'flex-end');
    topRow.style('padding-right', narrow ? '0' : '240px');
  }

  var resizeTimer = null;

  var resizeObserver = new ResizeObserver(function (entries) {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!entries.length) return;
      var entry = entries[entries.length - 1];

      // containerW is the actual viewport width of the chart-section.
      // newTotal is the chart render width - floored at MIN_CHART_WIDTH.
      // When containerW < MIN_CHART_WIDTH the chart stays at MIN_CHART_WIDTH
      // and hmChartScroll provides horizontal scrolling.
      var containerW = Math.floor(entry.contentRect.width) - 48;
      var newTotal   = Math.max(containerW, MIN_CHART_WIDTH);

      // Legend narrow/wide check uses containerW (actual viewport width)
      // not newTotal, so the legend drops below controls when the screen
      // is narrow even if the chart itself is still rendering at 600px.
      applyLegendLayout(computeNarrow(containerW));

      if (Math.abs(newTotal - totalWidth) <= 4) return;

      totalWidth = newTotal;
      W          = totalWidth - MARGIN.left - MARGIN.right;

      headerSVG.attr('width', totalWidth);
      bodySVG.attr('width', totalWidth);
      overlay.attr('width', W);
      headerBaseline.attr('x2', W);

      redraw();
    }, 120);
  });

  // Scroll sync: when the body scrolls horizontally, shift the hg group
  // to match so month labels and event markers stay aligned with columns.
  // The header SVG clips content that would extend past the container edge.
  hmChartScroll.node().addEventListener('scroll', function () {
    hg.attr('transform',
      'translate(' + (MARGIN.left - this.scrollLeft) + ',' + LAYOUT.HEADER_H + ')');
  });
  
  setTimeout(function () {
    var node = container.node();
    if (!node.parentElement) return;

    var target = node.closest('.chart-section') || node.parentElement;
    resizeObserver.observe(target);

    var containerW = Math.floor(target.getBoundingClientRect().width) - 48;
    var initW      = Math.max(containerW, MIN_CHART_WIDTH);

    // Legend layout uses actual container width, not chart render width
    applyLegendLayout(computeNarrow(containerW));

    if (Math.abs(initW - totalWidth) > 4) {
      totalWidth = initW;
      W          = totalWidth - MARGIN.left - MARGIN.right;
      headerSVG.attr('width', totalWidth);
      bodySVG.attr('width', totalWidth);
      overlay.attr('width', W);
      headerBaseline.attr('x2', W);
      redraw();
    }
  }, 0);


  redraw();
  return container.node();
}