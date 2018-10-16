// move to index.html
var publicSpreadsheetUrl = 'https://docs.google.com/spreadsheets/d/1N3g6lG4J16qCJ0dK2W0KhNF4h__jmR5Nhx6WV7oHaZg/';

var responseWorkbookSheetName = 'response'
//  spreadsheet needs...
// `sector` (defines how many maps are created)
// `admin` (place-code to match response data to geo data)
// `response` (activities, defines layers on each map)
// `number` (quantified impact)
var geoFilename = 'sulawesi-admin3.json'; // topojson file
var topojsonObjectsGroup = 'admin3';
// topojson geoFile should have
// admin names with a key equal to their level (1,2,3)
// and an "ID" field with the p-code for the linked admin level
var myColorScale = ["#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"];

// global variables
var responseData, adminFeatures


// helper functions
// ################

// https://www.codementor.io/avijitgupta/deep-copying-in-js-7x6q8vh5d 
function copy (o) {
  var output, v, key;
  output = Array.isArray(o) ? [] : {};
  for (key in o) {
    v = o[key];
    output[key] = (typeof v === "object") ? copy(v) : v;
  }
  return output;
}

// tooltip follows cursor
$(document).ready(function() {
  $('body').mouseover(function(e) {
    //Set the X and Y axis of the tooltip
    $('#tooltip').css('top', e.pageY + 10 );
    $('#tooltip').css('left', e.pageX + 20 );
  }).mousemove(function(e) {
    //Keep changing the X and Y axis for the tooltip, thus, the tooltip move along with the mouse
    $("#tooltip").css({top:(e.pageY+15)+"px",left:(e.pageX+20)+"px"});
  });
});

function toTitleCase(str) {
  return str.toLowerCase().replace(/(?:^|\s)\w/g, function(match) {
    return match.toUpperCase();
  });
}


// render the page
// ###############

function init() {
  // get the data from the google sheet
  // https://github.com/jsoma/tabletop
  Tabletop.init( { key: publicSpreadsheetUrl, callback: fetchOtherData } )
}

function fetchOtherData(data, tabletop) {
  // google sheet can have multiple sheets and we want only the data from one 
  responseData = data[responseWorkbookSheetName].elements
  // we will use this object to later store things 
  // like the leafleft map objects for each sector map
  responseDataObject = d3.nest()
    .key(function(d) { return d.sector; })
    .rollup(function(leaves) { 
      return {"count": leaves.length} 
    })
    .entries(responseData);
  
  // we're only loading 1 file, but d3.queue lets us add more data loads 
  // and wait for all to complete before continuing
  d3.queue()
    .defer(d3.json, '../data/' + geoFilename)
    .await(buildPage);
  
}

// inputs to this are passed from d3.queue
function buildPage(error, geoData) {
  // our admin geo is a topojson, so we need to pull out GeoJSON features
  adminFeatures = topojson.feature(geoData, geoData.objects[topojsonObjectsGroup]).features;
  // create a map for each sector
  var iterations = 0;
  for(i=0; i<responseDataObject.length; i++) {
    createSectorMap(i, function(){
      iterations++
      // and do some stuff once all the maps have been created
      if(iterations == responseDataObject.length) {
        syncMaps();
      }
    }); 
  }  
}

function syncMaps() {
  // maps all zoom and pan together
  // https://github.com/jieter/Leaflet.Sync
  for(i=0; i<responseDataObject.length; i++) { 
    for(n=0; n<responseDataObject.length; n++) { 
      if(i !== n) {
        responseDataObject[i].leafletMap.sync(responseDataObject[n].leafletMap);
      }
    }
  }
}


var quantize = d3.scaleQuantize()
    .domain([0, 10]) // we will change the domain to match the dataset each time we want to use this
    .range(myColorScale);

function colorMap(responseDataIndex, responseName) {
  
  d3.select("#map-"+responseDataIndex+" .layer-label").text(responseName);
  
  var responseNameData = responseData.filter(function(d) { 
    return d.sector == responseDataObject[responseDataIndex].key && d.response == responseName
  })
    
  var scaleNest = d3.nest()
    .key(function(d) { return d.admin; })
    .key(function(d) { return d.response; })
    .rollup(function(leaves) { 
      return {"count": leaves.length, "total_number": d3.sum(leaves, function(d) {return parseFloat(d.number);})} 
    })
    .entries(responseNameData);
  
  quantize.domain([
      d3.min(d3.values(scaleNest), function(d) { return d.values[0].value.total_number; }),
      d3.max(d3.values(scaleNest), function(d) { return d.values[0].value.total_number; })
    ]);
  
  d3.select("#adminGeo-"+responseDataIndex).selectAll('.admin').each(function(d,i){
    var mapElement = this;
    if(d.properties.response){
      var styled = false;
      d.properties.response.forEach(function(item,itemIndex){
        if(item.key == responseName) {
          styled = true;
          d3.select(mapElement)
            .style("fill", function(d){
              return quantize(item.value.total_number);
            })
            .attr("data-response", responseName);
        }
      });
      if(styled == false){
        d3.select(mapElement)
          .style("fill", function(d){ return null; })
          .attr("data-response", null);
      }
    }
  });
  
}


function createSectorMap(index, callback) {
  
  var sectorResponseData = d3.nest()
    .key(function(d) { return d.sector; })
    .key(function(d) { return d.admin; })
    .key(function(d) { return d.response; })
    .rollup(function(leaves) { 
      return {"count": leaves.length, "total_number": d3.sum(leaves, function(d) {return parseFloat(d.number);})} 
    })
    .entries(responseData.filter(function(d) { return d.sector == responseDataObject[index].key }));
  
  
  var hotUrl = 'http://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    hotAttribution = '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, Tiles from <a href="http://hot.openstreetmap.org/" target="_blank">H.O.T.</a>',
    hotLayer = L.tileLayer(hotUrl, {attribution: hotAttribution});
    
  var mapId = "map-" + index;
  var mapHtml = '<div class="row">' +
    '<h3>' + sectorResponseData[0].key + '</h3>' +
    '<div id="' + mapId + '" class="response-map"></div>'+
    '</div>';
  $('#maps-wrapper').append(mapHtml);
  
  var map = L.map(mapId, {
    layers: [hotLayer],
    center: new L.LatLng(0,0),
    zoom: 8
  });
  responseDataObject[index].leafletMap = map;
  
  function projectPoint(x, y){
    var point = map.latLngToLayerPoint(new L.LatLng(y, x));
    this.stream.point(point.x, point.y);
  }
  var transform = d3.geoTransform({point: projectPoint});
  var path = d3.geoPath().projection(transform);
  
  L.svg().addTo(map);
  // pick up the SVG from the map object
  var svg = d3.select('#'+mapId).select('svg');
  var adminGeoGroup = svg.append('g').attr('id', 'adminGeo-'+index);
  var admins;

  var sectorJoin = copy(adminFeatures);
  for(a=0;a<sectorJoin.length;a++) {
    for(b=0;b<sectorResponseData[0].values.length;b++) {
      if(sectorJoin[a].properties.ID == sectorResponseData[0].values[b].key) {
        sectorJoin[a].properties.response = sectorResponseData[0].values[b].values;
      }
    }
  }
  
  
  admins = adminGeoGroup.selectAll("path")
    .data(sectorJoin, function(d){ return d.properties.ID; })
    .enter().append("path")
    .attr("class", "admin admin__default")
    .attr("d", path)
    .on("mouseover", function(d) {
      // console.log(d3.select(this).attr("data-response"))
      globalName = d.properties['2']
      var tooltipText = "<small><span class='place-name'>" + toTitleCase(d.properties['2']) +
        ", " + toTitleCase(d.properties['3']) + "</span>";
      
      var dataKey = d3.select(this).attr('data-response');  
      if(dataKey !== null) {
        d.properties.response.forEach(function(item,itemIndex){
          if(item.key == dataKey) {
            tooltipText += " <br> Report count: " + item.value.count +
              " <br> Reached count: " + item.value.total_number;
          }
        });
      }    
      tooltipText += "</small>";
      $('#tooltip').html(tooltipText);
    })
    .on("mouseout", function(d) {
      $('#tooltip').empty();
    })

  updatePath = function(){ admins.attr("d", path); }
  map.on('zoom move viewreset', updatePath);
  updatePath();
  
  responseDataObject[index].svgPaths = admins;
  
  L.control.custom({
    position: 'bottomleft',
    content : '<h3><span class="layer-label label label-default">Select a data layer</span></h3>'
  }).addTo(map);
  
  var controlListItems = "";
  var responseNest = d3.nest()
    .key(function(d) { return d.response; })
    .rollup(function(leaves) { return {"count": leaves.length} })
    .entries(responseData.filter(function(d) { return d.sector == responseDataObject[index].key }));

  responseNest.forEach(function(item, itemIndex){
    controlListItems += '<li><a href="#" onClick= "colorMap('+ index + ",'" + item.key + "'" + ')">' + item.key + '</a></li>';
  })
  
  L.control.custom({
      position: 'topright',
      content : '<div class="dropdown ">' +
        '<button class="btn btn-default dropdown-toggle" type="button" id="dropdownMenu1" data-toggle="dropdown" aria-haspopup="true" aria-expanded="true">' +
          'Select data ' +
          '<span class="caret"></span>' +
        '</button>' +
        '<ul class="dropdown-menu dropdown-menu-right" aria-labelledby="dropdownMenu1">' +
          controlListItems +
        '</ul>' +
      '</div>'
  }).addTo(map);
  
  map.fitBounds(L.geoJSON(sectorJoin).getBounds())
  
  callback()
  
}

init();