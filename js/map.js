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


// globals
var responseData, adminFeatures


window.onload = function() {
  Tabletop.init( { key: publicSpreadsheetUrl, callback: fetchOtherData } )
}

function fetchOtherData(data, tabletop) {

  responseData = data[responseWorkbookSheetName].elements
  responseDataObject = d3.nest()
    .key(function(d) { return d.sector; })
    .rollup(function(leaves) { 
      return {"count": leaves.length} 
    })
    .entries(responseData);
  
  d3.queue()
    .defer(d3.json, '../data/' + geoFilename)
    .await(buildPage);
  
}

function buildPage(error, geoData) {
  
  adminFeatures = topojson.feature(geoData, geoData.objects[topojsonObjectsGroup]).features;
  var iterations = 0;
  for(i=0; i<responseDataObject.length; i++) {
    createSectorMap(i, function(){
      iterations++
      if(iterations == responseDataObject.length) {
        syncMaps();
      }
    }); 
  }  
}

function syncMaps() {
  for(i=0; i<responseDataObject.length; i++) { 
    for(n=0; n<responseDataObject.length; n++) { 
      if(i !== n) {
        responseDataObject[i].leafletMap.sync(responseDataObject[n].leafletMap);
      }
    }
  }
}


var quantize = d3.scaleQuantize()
    .domain([0, 10])
    .range(["#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"]);

function colorMap(responseDataIndex, responseName) {
  
  d3.select("#map-"+responseDataIndex+" .layer-label").text(responseName);
  
  responseNameData = responseData.filter(function(d) { 
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
        var thisItem = item;
        if(item.key == responseName) {
          styled = true;
          d3.select(mapElement).style("fill", function(d){
            return quantize(item.value.total_number);
          })
        }
      });
      if(styled == false){
        d3.select(mapElement).style("fill", function(d){ return null; })
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
    center: new L.LatLng(-1.672,120.026),
    zoom: 8,
    minZoom: 6
    // maxBounds: [ [-7.5, 115.0], [-9.7, 117.5] ]
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
  
  var sectorJoin = adminFeatures;
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
  console.log(responseNest)
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
  
  callback()
  
}
