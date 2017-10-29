/*
   Copyright 2010-2016 Portland Transport

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

var transitBoardByLine = {}; // keep state

// constants

transitBoardByLine.APP_NAME 		= "Transit Board by Line";
transitBoardByLine.APP_VERSION 	= "2.22";
transitBoardByLine.APP_ID 			= "tbdbyline";

// v2.17 - upgrade jQuery to 1.11.0
// v2.18 - add classes to enable PCC styling
// v2.19 - add GBFS
// v2.21 - add smarter re-add of car2go elements
// v2.22 - even more car2go intelligence

// assess environment

transitBoardByLine.is_development = (document.domain == "dev.transitboard.com");
transitBoardByLine.isChumby = navigator.userAgent.match(/QtEmb/) != null;




// load dependencies

transitBoardByLine.dependencies = [
		"../assets/js/tracekit.js",
		"../assets/js/libraries/fleegix.js",
		"../assets/js/libraries/tzdate.js",
		"../assets/js/libraries/jquery-ui-1.8.7.custom.min.js",	
		"../assets/js/libraries/date.js",
		//"../assets/js/libraries/animation_frame.js",
		"../assets/js/trArrUtilities.js",	
		"../assets/js/trStopCache.js",
		"../assets/js/trAgencyCache.js",
		"../assets/js/trLoader.js",
		"../assets/js/trArr.js",
		"../assets/js/libraries/jquery.isotope.js",
		"../assets/js/trCar2Go.js",
		"../assets/js/trGBFS.js",
		"../assets/js/trWeather.js"
];


(function () {

	// deliberately defeat caching
	
	var timestamp = (new Date()).getTime();
	
	for (var i = 0; i < transitBoardByLine.dependencies.length; i++) {
		transitBoardByLine.dependencies[i] += "?timestamp=" + timestamp;
	}
	
	// load stylesheet
	$('head').append('<link rel="stylesheet" type="text/css" href="transitBoardByLine.css?timestamp'+timestamp+'">');
	if (!transitBoardByLine.isChumby) {
		// load fonts
		$('head').append('<link rel="stylesheet" type="text/css" href="../assets/fonts/DejuVu/stylesheet.css?timestamp='+timestamp+'">');
	}

}());

head.js.apply(undefined,transitBoardByLine.dependencies);

transitBoardByLine.paging_state = {}; // paging state
transitBoardByLine.paging_state.next_row = undefined;
transitBoardByLine.paging_state.page_number = 0;
transitBoardByLine.standing_messages = new Array;
transitBoardByLine.connection_health = 1;
transitBoardByLine.service_messages = [];
transitBoardByLine.minutes_limit = 0;
transitBoardByLine.arrivals_limit = 0;
transitBoardByLine.rotation_complete = true;
transitBoardByLine.banks = ['bank1','bank2'];

transitBoardByLine.animation_factor = 0.85; // arbitrary value to allow for pause time plus javascript processing time, will be dynamically adjusted
transitBoardByLine.messages = [];
transitBoardByLine.start_time = new Date();
transitBoardByLine.car2go = 0;
transitBoardByLine.gbfs = 0;
transitBoardByLine.weather = false;
transitBoardByLine.suppress_scrolling = false;
transitBoardByLine.alerts = false;
transitBoardByLine.suppress_downtown_only = false;

transitBoardByLine.platform = "";

transitBoardByLine.isotope_container = null;

transitBoardByLine.standing_messages.push("<span>TransitBoard&trade; is a product of Portland Transport.</span>");
transitBoardByLine.standing_messages.push("<span>Learn more at http://transitappliance.com</span>");


transitBoardByLine.formatted_arrival_time = function(arrival) {
	var displayTime = "";
	var milliseconds_until_arrival = arrival.arrivalTime - new Date();
	
	var minutes_until_arrival = Math.round(milliseconds_until_arrival/60000);
	if (minutes_until_arrival == 0) {
		minutes_until_arrival = "Due";
	} else {
		minutes_until_arrival = "<nobr>"+minutes_until_arrival+" min</nobr>"; 
	}
	if (arrival.type == 'scheduled') {
		timeclass = ' scheduled';
		var sched_date = localTime(arrival.arrivalTime);
		displayTime = sched_date.toString('h:mmtt');
		displayTime = displayTime.replace(/^0:/,'12:');
	} else {
		displayTime = minutes_until_arrival;
		timeclass = "";
	}
	
	return displayTime;
}

transitBoardByLine.resetMessageQueue = function() {
	transitBoardByLine.messages = [];
	for (var i = 0; i < transitBoardByLine.standing_messages.length; i++) {
		transitBoardByLine.messages.push(transitBoardByLine.standing_messages[i]);
	}
	// raw score: messages.push('<span style="font-weight: bold; color: red">['+transitBoardByLine.connection_health+']</span>');
	if (transitBoardByLine.connection_health < 0.2) {
		transitBoardByLine.messages.push('<span style="font-weight: bold; color: red">This display has lost connectivity.</span>');
		if (transitBoardByLine.appliance_id != "Unassigned") {
			trLoader(transitBoardByLine.appliance_id);
		}
	} else if (transitBoardByLine.connection_health < 0.5) {
		transitBoardByLine.messages.push('<span style="font-weight: bold; color: red">This display is experencing severe connection issues.</span>');
	} else if (transitBoardByLine.connection_health < 0.8) {
		transitBoardByLine.messages.push('<span style="font-weight: bold; color: red">This display is experencing connection issues.</span>');
	}
	for (var i = 0; i < transitBoardByLine.service_messages.length; i++) {
		transitBoardByLine.messages.push('<span style="font-weight: bold; color: red">'+transitBoardByLine.service_messages[i]+'</span>');
	}
	var dimensions = jQuery("body").innerWidth()+"x"+jQuery("body").innerHeight();
	var is_dev = "";
	if (transitBoardByLine.is_development) {
		is_dev = "D ";
	}
  transitBoardByLine.messages.push("<span style=\"font-size: 60%\">["+is_dev+transitBoardByLine.start_time_formatted+" "+transitBoardByLine.appliance_id+" "+dimensions+" "+transitBoardByLine.animation_factor+" "+transitBoardByLine.platform+"]</span>");
}

transitBoardByLine.advanceMessage = function() {
	if (transitBoardByLine.messages.length != 0) {
		var message = transitBoardByLine.messages.shift();
		jQuery("div.scroller").fadeOut("slow",function() {
			jQuery("div.scroller").html("<table><tr><td align=\"center\">"+message+"</td></tr></table>");
			jQuery("div.scroller").fadeIn("slow");
		});
	}
	if (transitBoardByLine.messages.length == 0) {
		transitBoardByLine.resetMessageQueue();
	}
}

transitBoardByLine.initializePage = function(data) {	
	
	// initialize screen margins
	
	var body_width 		= data.optionsConfig.width || jQuery(window).width();
	var body_height 	= data.optionsConfig.height || jQuery(window).height();	

	var left_border 	= data.optionsConfig.left || 0;
	var bottom_border = data.optionsConfig.bottom || 0;
	var top_border 		= data.optionsConfig.top || 0;
	var right_border 	= data.optionsConfig.right || 0;
	
	jQuery("body").css("width",body_width-left_border-right_border).css("height",body_height-bottom_border-top_border);

	jQuery("body").css('border-left-width',left_border);
	jQuery("body").css('border-top-width',top_border);
	jQuery("body").css('border-right-width',right_border);
	jQuery("body").css('border-bottom-width',bottom_border);
	jQuery("body").css('position','relative'); // for reasons I haven't figured out, this has to be set late
	
	if (data.applianceConfig != undefined && data.applianceConfig.id != undefined && data.applianceConfig.id[0] != undefined) {
		transitBoardByLine.appliance_id = data.applianceConfig.id[0];
	} else {
		transitBoardByLine.appliance_id = "Unassigned";
	}
	
	if (data.optionsConfig.platform != undefined && data.optionsConfig.platform[0] != undefined) {
		transitBoardByLine.platform = data.optionsConfig.platform[0];
	}
	
	// initialize car2go object if needed
	
	if (data.optionsConfig != undefined && data.optionsConfig.lat != undefined && data.optionsConfig.lat[0] != undefined) {
		if (data.optionsConfig.lng != undefined && data.optionsConfig.lng[0] != undefined) {
			if (data.optionsConfig.car2go != undefined && data.optionsConfig.car2go[0] != undefined) {
				transitBoardByLine.car2go = data.optionsConfig.car2go[0];
				if (transitBoardByLine.car2go != 0 ) {
					transitBoardByLine.cars = new trCar2Go({
						lat: data.optionsConfig.lat[0],
						lng: data.optionsConfig.lng[0],
						loc: 'portland',
						consumer_key: 'TransitAppliance',
						num_vehicles: transitBoardByLine.car2go
					});
				}
			}
		}
	}
	
	// initialize GBFS object if needed
	
	if (data.optionsConfig != undefined && data.optionsConfig.lat != undefined && data.optionsConfig.lat[0] != undefined) {
		if (data.optionsConfig.lng != undefined && data.optionsConfig.lng[0] != undefined) {
			if (data.optionsConfig.gbfs != undefined && data.optionsConfig.gbfs[0] != undefined) {
				transitBoardByLine.gbfs = data.optionsConfig.gbfs[0];
				var free_bikes = 0;
				if (data.optionsConfig.include_free_bikes != undefined && data.optionsConfig.include_free_bikes[0] != undefined) {
				  free_bikes = data.optionsConfig.include_free_bikes[0];
				}
				if (transitBoardByLine.gbfs != 0 ) {
					transitBoardByLine.bikes = new trGBFS({
						lat: data.optionsConfig.lat[0],
						lng: data.optionsConfig.lng[0],
						loc: 'http://biketownpdx.socialbicycles.com/opendata/gbfs.json',
						num_locations: transitBoardByLine.gbfs,
						include_free_bikes: free_bikes
					});
				}
			}
		}
	}
	
	if (data.optionsConfig != undefined && data.optionsConfig.lat != undefined && data.optionsConfig.lat[0] != undefined) {
		if (data.optionsConfig.lng != undefined && data.optionsConfig.lng[0] != undefined) {
			if (data.optionsConfig != undefined && data.optionsConfig.show_weather != undefined && data.optionsConfig.show_weather[0] != undefined && data.optionsConfig.show_weather[0] != 0) {
				transitBoardByLine.weather = data.optionsConfig.show_weather[0];
				transitBoardByLine.forecast = new trWeather({
					id:		transitBoardByLine.appliance_id,
					lat: 	data.optionsConfig.lat[0],
					lng: 	data.optionsConfig.lng[0]
				});
			}
		}
	}
	

	if (jQuery("body").innerWidth() < jQuery("body").innerHeight()) {
		jQuery("body").addClass('tb_portrait');
	}
	

	// kill the logging element
	jQuery("#arrivals_log_area").remove();
	
	transitBoardByLine.displayInterval = data.displayInterval;
	if (data.optionsConfig != undefined && data.optionsConfig.display_interval != undefined && data.optionsConfig.display_interval[0] != undefined) {
		transitBoardByLine.displayInterval = data.optionsConfig.display_interval[0]*1000;
	}	
	
	transitBoardByLine.start_time_formatted = localTime(new Date()).toString("MM/dd hh:mmt");
	
	

	
	if (data.optionsConfig.banner != undefined && data.optionsConfig.banner[0] != undefined) {
		var banner = data.optionsConfig.banner[0];

		if (banner.substr(0,1) == '*') {
			document.title = banner.substr(1);
		} else {
			document.title = "Transit Board(tm) for "+banner;
		}
		transitBoardByLine.banner = data.optionsConfig.banner[0];
	} else {
		transitBoardByLine.banner = "";
	}
	
	if (data.optionsConfig.suppress_scrolling != undefined && data.optionsConfig.suppress_scrolling[0] != undefined && data.optionsConfig.suppress_scrolling[0] != "" && data.optionsConfig.suppress_scrolling[0] != 0) {
		transitBoardByLine.suppress_scrolling = true;
		transitBoardByLine.banks = ['bank1'];
	}
	
	if (data.optionsConfig.alerts != undefined && data.optionsConfig.alerts[0] != undefined && data.optionsConfig.alerts[0] != "" && data.optionsConfig.alerts[0] != 0) {
		transitBoardByLine.alerts = true;
	}	
	
	if (data.optionsConfig.suppress_downtown_only != undefined && data.optionsConfig.suppress_downtown_only[0] != undefined && data.optionsConfig.suppress_downtown_only[0] != "" && data.optionsConfig.suppress_downtown_only[0] != 0) {
		transitBoardByLine.suppress_downtown_only = true;
	}
	
	if (data.optionsConfig.minutes_limit != undefined && data.optionsConfig.minutes_limit[0] != undefined && data.optionsConfig.minutes_limit[0] != 0) {
		transitBoardByLine.minutes_limit = data.optionsConfig.minutes_limit[0];
	}
	if (transitBoardByLine.minutes_limit == 0) {
		transitBoardByLine.minutes_limit = 60;
	}
	
	if (data.optionsConfig.arrivals_limit != undefined && data.optionsConfig.arrivals_limit[0] != undefined && data.optionsConfig.arrivals_limit[0] != 0) {
		transitBoardByLine.arrivals_limit = data.optionsConfig.arrivals_limit[0];
	}
	
	if (data.optionsConfig['split-by-direction'] != undefined && data.optionsConfig['split-by-direction'][0] != undefined && data.optionsConfig['split-by-direction'][0] != 0) {
		transitBoardByLine.split_by_direction = true;
	} else {
		transitBoardByLine.split_by_direction = false;
	}
	
	if (data.optionsConfig.columns != undefined && data.optionsConfig.columns[0] != undefined && data.optionsConfig.columns[0] != 0) {
		transitBoardByLine.columns = data.optionsConfig.columns[0];
	} else {
		transitBoardByLine.columns = 2; // default
	}
	
	
	// add stylesheet

	if (data.optionsConfig.stylesheet != undefined && data.optionsConfig.stylesheet[0] != undefined) {
		var link = jQuery("<link>");
		link.attr({
			type: 'text/css',
		  rel: 'stylesheet',
		  href: data.optionsConfig.stylesheet[0]
		});
		jQuery("head").append( link ); 
		
	}
	
	if (data.optionsConfig.logo != undefined && data.optionsConfig.logo[0] != undefined && data.optionsConfig.logo[0] != "") {
		var logo = '<img src="'+data.optionsConfig.logo[0]+'">';
	} else {
		var logo = '';
	}
	

	var font_scale_factor = 1;
	if (data.optionsConfig['font-size-adjust'] != undefined && data.optionsConfig['font-size-adjust'][0] != undefined) {
		font_scale_factor = data.optionsConfig['font-size-adjust'][0]/100;
	}
	
	// set sizes
	var window_height = jQuery("body").innerHeight();
	var basic_text = Math.floor(font_scale_factor*window_height/30) + "px";
	var double_text = Math.floor(font_scale_factor*window_height/15) + "px";
	var large_text = Math.floor(font_scale_factor*window_height/20) + "px";
	var padding    = Math.floor(font_scale_factor*window_height/100) + "px";
	var scroller_height = (Math.floor(font_scale_factor*window_height/30)+Math.floor(font_scale_factor*window_height/100)) + "px";
	
	// bigger fonts for wider displays
	if (jQuery("body").innerWidth()/window_height > 1.4) {
		basic_text = Math.floor(font_scale_factor*window_height/22) + "px";
		double_text = Math.floor(font_scale_factor*window_height/11) + "px";
		large_text = Math.floor(font_scale_factor*window_height/14) + "px";
		padding    = Math.floor(font_scale_factor*window_height/100) + "px";
		scroller_height = (Math.floor(font_scale_factor*window_height/22)+Math.floor(font_scale_factor*window_height/100)) + "px";
	}
	

	jQuery("head").append(jQuery('\
		<style>\
			#tb_bottom td { font-size: '+basic_text+';}\
			body.tb_portrait #tb_bottom td { font-size: '+double_text+';}\
			body.tb_portrait #tb_bottom td#tb_ticker { font-size: '+basic_text+';}\
			body.tb_portrait #tb_bottom td#tb_ticker td { font-size: '+basic_text+';}\
			h1 { font-size: '+large_text+'; margin-bottom: '+padding+'; }\
			body { overflow: hidden }\
		</style>\
	'));
	
	// get the rights strings
	for (var agency in data.stopsConfig) {
		transitBoardByLine.standing_messages.push("<span>"+data.agencyCache.agencyData(agency).rights_notice+"</span>");
	}
	if (transitBoardByLine.weather) {
		transitBoardByLine.standing_messages.push("<span>Weather Powered by Dark Sky</span>");
	}
	transitBoardByLine.standing_messages.push("<span>HH:MM = scheduled arrival, real-time estimate unavailable.</span>");
		
	// populate html
	
	var html = '\
<div id="tb_top">\
	';
	if ((logo != "") || (transitBoardByLine.banner != "")) {
		html += '\
<table cellpadding="10"><tr valign="middle">\
		';
		if (logo != "") {
			html += '<td id="logo" align="center">'+logo+'</td>';
		}
		if (transitBoardByLine.banner.substr(0,1) == "*") {
			html+= '<td id="banner" width="100%" align="center"><h1>'+transitBoardByLine.banner.substr(1)+'</h1></td>';
		} else if (transitBoardByLine.banner != "") {
			html+= '<td id="banner" width="100%" align="center"><h1>Transit Board&trade; for '+transitBoardByLine.banner+'</h1></td>';
		}
		html += '\
</tr></table>\
		';
	}
	html += '\
</div>\
<div id="tb_middle">\
	<div id="arrivals_outer_wrapper">\
		<div id="wrapper1">\
		<table id="trip1" class="3639_4DivisiontoGreshamTCA trip_wrapper active isotope-item" data-sortkey="50040">\
			<tbody class="trip service_color_yellow">\
				<tr valign="middle">\
					<td class="route"><span>MAXi</span></td>\
					<td class="destination"><div>Division to <span class="terminus">Gresham TC</span> from SW Madison &amp; 4th and tack on some very long text that is bound to overflow if we keep adding more and more and more and more of it</div></td>\
					<td class="arrivals">\
							<span>10:08AMa<br>\
							<span class="second_arrival">2 min</span><span>\
					</td>\
				</tr>\
			</tbody>\
		</table>\
		</div>\
		<div id="wrapper2">\
		<table id="trip2" class="3639_4DivisiontoGreshamTCB trip_wrapper active isotope-item" data-sortkey="50050">\
			<tbody class="trip service_color_yellow">\
				<tr valign="middle">\
					<td class="route"><span>MAXi</span></td>\
					<td class="destination"><div>Division to <span class="terminus">Gresham TC</span> from SW Madison &amp; 4th and tack on some very long text that is bound to overflow if we keep adding more and more and more and more of it</div></td>\
					<td class="arrivals">\
							<span>10:08AMa<br>\
							<span class="second_arrival">2 min</span><span>\
					</td>\
				</tr>\
			</tbody>\
		</table>\
		</div>\
	</div>\
</div>\
<table id="tb_bottom"><tr><td id="tb_clock"></td><td id="tb_ticker"><div class="scroller"><div class="scrollingtext"></div></div></td></tr></table>\
	';
	
	jQuery('body').html(html);

	var trip_scale_factor = 1;
	if (data.optionsConfig['trip-size-adjust'] != undefined && data.optionsConfig['trip-size-adjust'][0] != undefined) {
		trip_scale_factor = data.optionsConfig['trip-size-adjust'][0]/100;
	}
	
	var base_em_size = parseFloat(jQuery("table.trip_wrapper").css("font-size"),10);
	base_em_size = (base_em_size*trip_scale_factor);
	// create style section with new size
	
	jQuery("head").append(jQuery('\
		<style>\
			table.trip_wrapper { font-size: '+base_em_size+'px; }\
		</style>\
	'));	
		


	setTimeout( function() {
		
		// minimize width of route and arrival elements
		var route_cell_width = jQuery("#trip1 td.route").width();
		var route_text_width = jQuery("#trip1 td.route span").width();
		var arrivals_text_width = jQuery("#trip1 td.arrivals span").width();
		var destination_text_width = jQuery("#trip1 td.destination span").width();
		//alert(route_cell_width+" "+route_text_width);
		
		transitBoardByLine.target_width = Math.floor(jQuery("#tb_middle").width()/transitBoardByLine.columns);
		
		jQuery("head").append(jQuery('\
			<style>\
			table.trip_wrapper { width: '+transitBoardByLine.target_width+'px; }\
				table.trip_wrapper tbody tr td.route { min-width: '+route_text_width+'px !important; }\
				table.trip_wrapper tbody tr td.arrivals { min-width: '+arrivals_text_width+'px !important; }\
				table.trip_wrapper tbody tr td.destination { width: 100% }\
			</style>\
		'));
	
		transitBoardByLine.target_width = Math.floor(jQuery("#tb_middle").width()/transitBoardByLine.columns);
		var actual_width = jQuery("tbody.trip").outerWidth(true);
			
		var destination_wrapper_width = jQuery("table.trip_wrapper tbody tr td.destination").width() + transitBoardByLine.target_width - actual_width;
				
		// mark sure the top margin is an integer
		var margin = parseInt(jQuery("table.trip_wrapper").css("margin-top"),10);
		margin = Math.floor(margin+0);
	
		jQuery("head").append(jQuery('\
			<style>\
				/*table.trip_wrapper tbody tr td.destination { width: '+destination_wrapper_width+'px; }*/\
				table.trip_wrapper { height: '+jQuery('#trip2').height()+'px; width: '+transitBoardByLine.target_width+'px; margin-top: '+margin+'px; }\
			</style>\
		'));
		
		// set up scroller
	
		var cell_width = jQuery("#tb_ticker").width();
		jQuery(".scroller").css("height",scroller_height);
		
		setTimeout(function(){
			// allow html to settle before calculating heights
		
			var trip_height = jQuery('#trip2').outerHeight(true);
			transitBoardByLine.trip_height = trip_height;
			transitBoardByLine.max_available_height = jQuery("#tb_bottom").offset().top - jQuery("#tb_middle").offset().top - 20;
			transitBoardByLine.rows_per_screen = Math.floor(transitBoardByLine.max_available_height/trip_height);
			transitBoardByLine.max_available_height = transitBoardByLine.rows_per_screen*trip_height;
			transitBoardByLine.animation_step_rows = Math.ceil(transitBoardByLine.rows_per_screen/3);
			transitBoardByLine.animation_step = transitBoardByLine.animation_step_rows*trip_height;

			
			// set the height of the div
			jQuery("#tb_middle").css("height",transitBoardByLine.max_available_height+"px").css("width","100%");
			
			// kill the test divs
			jQuery("#wrapper1,#wrapper2").remove();


		},2000);
		
	},2000);
	
}

transitBoardByLine.do_animation_step = function(total_rows,total_steps,remaining_rows,remaining_steps) {
	
	/*
		figure out step pattern
		
		general goal is to scroll 1/3 of visible entries in each step, but we don't want 'orphans'
		e.g., instead of 3,3,3,1 we'd rather do 3,3,2,2
	*/	

	var rows_this_step = Math.ceil(remaining_rows/remaining_steps);
	
	remaining_rows = remaining_rows - rows_this_step;
	remaining_steps--;
	
	var cumulative_rows = total_rows - remaining_rows;
	
	var step_time_per_row = transitBoardByLine.animation_factor*transitBoardByLine.displayInterval/(4*total_rows);
	
	var animation_step_time = step_time_per_row * rows_this_step;
	var animation_target = -transitBoardByLine.isotope_container.height()/2;
		
	var current_top = parseInt(jQuery('#arrivals_outer_wrapper').css("top"));
	var target_top = current_top - transitBoardByLine.trip_height*rows_this_step;
	//alert("current top: "+current_top+", target: "+target_top);
	var last = false;
	if (target_top <= animation_target) {
		target_top = animation_target;
		last = true;
	}
	var duration = (animation_step_time/2)+"ms";
	jQuery('#arrivals_outer_wrapper').css({"transition-duration": duration, "-webkit-transition-duration": duration, "-moz-transition-duration": duration});
	//jQuery('#arrivals_outer_wrapper').css("top", target_top);
	//alert(target_top);
	var transform_value = "translateY("+-1*cumulative_rows*transitBoardByLine.trip_height+"px)";
	if (cumulative_rows == total_rows) {
		last = true;
	}
	//alert(transform_value);
	jQuery('#arrivals_outer_wrapper').css("transform",transform_value).css("-webkit-transform",transform_value).css("-moz-transform",transform_value);
	//alert(jQuery('#arrivals_outer_wrapper').css("-webkit-transform"));
	
	setTimeout(function() {
		if (last) {
			jQuery('#arrivals_outer_wrapper').css({"transition-duration": "0s", "-webkit-transition-duration": "0s", "-moz-transition-duration": "0s", "-ms-transition-duration": "0s"});
			jQuery('#arrivals_outer_wrapper').css("top","0");
			jQuery('#arrivals_outer_wrapper').css({"transform": "translateY(0px)", "-webkit-transform": "translateY(0px)", "-moz-transform": "translateY(0px)", "-ms-transform": "translateY(0px)"});
			transitBoardByLine.rotation_complete = true;
		} else {
			setTimeout(function() {
				transitBoardByLine.do_animation_step(total_rows,total_steps,remaining_rows,remaining_steps);
			},animation_step_time*3);
			transitBoardByLine.advanceMessage();
		}
	},animation_step_time);
}



transitBoardByLine.animate_display = function() {
	
	/* 
		This method is resposible for 'scrolling' the display if there are more rows of arrivals than will fit on the screen.
		
		This is accomplished by have two copies (bank1 and bank2) of the arrivals listing so that if we move the div with the arrivals up, 
		the first (top) arrival shows at the bottom, etc.
		
		If there are not more arrivals than will fit, bank2 is hidden
	*/
	
	/* create a list of all the ids for the arrivals that we can use for manipulation */
	
	var trip_ids = [];
	jQuery(".trip_wrapper.bank1.active").each(function(index,item){
		trip_ids.push(jQuery(item).attr("data-tripid"));
	});
	
	/* compute number of rows */
	var total_rows = Math.ceil(trip_ids.length/transitBoardByLine.columns);
	var total_steps = Math.ceil(total_rows/transitBoardByLine.animation_step_rows);
		
	var animation_start = new Date();
	if (total_rows > transitBoardByLine.rows_per_screen && !transitBoardByLine.suppress_scrolling) {
		/* we have more rows than we can show in one screen, so we rotate */
		
		/* activate both banks of arrivals */
		transitBoardByLine.isotope_container.isotope({ filter: '.active' }).isotope( 'reLayout' ).isotope();
		
		if (transitBoardByLine.rotation_complete) {
			/* ensure that we completed last rotation */
			transitBoardByLine.rotation_complete = false; /* reset done flag */
			
			jQuery('#arrivals_outer_wrapper').css("top","0px"); // reset to top, in case we drifted somehow
			jQuery('#arrivals_outer_wrapper').css({"transform": "translateY(0px)", "-webkit-transform": "translateY(0px)", "-moz-transform": "translateY(0px)", "-ms-transform": "translateY(0px)"});

			setTimeout(function() {
				transitBoardByLine.do_animation_step(total_rows,total_steps,total_rows,total_steps);
			},2000); // initial two second delay in starting animation
		} else {
			//fell behind, so we don't animate stops
			if (transitBoardByLine.animation_factor > 0.6) {
				transitBoardByLine.animation_factor = transitBoardByLine.animation_factor * 0.95; // speed things up a bit
			}
		}
	} else {
		/* everything fits on one screen, just worry about rotating messages in bottom pane */
		
		/* hide second bank of arrivals */
		transitBoardByLine.isotope_container.isotope({ filter: '.bank1.active' }).isotope( 'reLayout' ).isotope();
		
		// need to rotate message
		var message_interval = transitBoardByLine.displayInterval/4;
		// 3 times
		transitBoardByLine.advanceMessage();
		setTimeout(function() {
			transitBoardByLine.advanceMessage();
			setTimeout(function() {
				transitBoardByLine.advanceMessage();
			},message_interval);
		},message_interval);
	}
}

transitBoardByLine.displayPage = function(data, callback) {
	
	var running_time = new Date() - transitBoardByLine.start_time;
	var running_minutes = Math.floor(running_time/(60*1000));
	var client_time = localTime();
	
	if (transitBoardByLine.alerts) {
		transitBoardByLine.service_messages = data.serviceMessages;
	}
	
	if (running_minutes > 65 && client_time.getHours() == 3 && transitBoardByLine.isChumby) {
		location.reload();
	}
	
	if (data.displayCallCount == -1) {
		if (callback) {
			callback();
		}
		return;
	}
		
	transitBoardByLine.isotope_container = jQuery('#arrivals_outer_wrapper');
	transitBoardByLine.isotope_container.isotope(
		{
		  // options
		  animationEngine: 'best-available',
		  transformsEnabled: !transitBoardByLine.isChumby,
		  itemSelector : 'table.trip_wrapper',
		  layoutMode: 'masonry',  
			getSortData : {
			  sortkey : function ( $elem ) {
			  	var bank = 0;
			  	if ($elem.attr('data-bank')) {
			  		bank = $elem.attr('data-bank').replace('bank','');
			  	}
			    return parseInt(bank)*10000000 +parseInt($elem.attr('data-sortkey'));
			  }
			},
			sortBy : 'sortkey'
		}
	);
			
	// we finished paging sequence previously, need to build a new page state
	
	var by_trip = {};
	
	var filtered_queue = filter_queue(data.arrivalsQueue);
	
	for (var i = 0; i < filtered_queue.length; i++) {
		
		var trip_identifier = filtered_queue[i].stop_id+"_"+filtered_queue[i].headsign.replace(/[^a-zA-Z0-9]/g,"");
		
		if (filtered_queue[i].headsign.substr(0,3) == 'MAX') {
			filtered_queue[i].app_route_id = "MAX";
			filtered_queue[i].app_headsign_less_route = filtered_queue[i].headsign.replace(/^MAX /,"");
			filtered_queue[i].app_color = filtered_queue[i].app_headsign_less_route.replace(/ .*$/,"").toLowerCase();
		} else if (filtered_queue[i].route_id == "193") {
			filtered_queue[i].app_route_id = "NS";
			filtered_queue[i].app_headsign_less_route = "<b>Streetcar</b> "+filtered_queue[i].headsign.replace("Portland Streetcar","");		
			filtered_queue[i].app_color = 'streetcar'
		} else if (filtered_queue[i].route_id == "194") {
			filtered_queue[i].app_route_id = "A";
			filtered_queue[i].app_headsign_less_route = "<b>Streetcar</b> "+filtered_queue[i].headsign.replace("Portland Streetcar","");		
			filtered_queue[i].app_color = 'streetcar'
		} else if (filtered_queue[i].route_id == "195") {
			filtered_queue[i].app_route_id = "B";
			filtered_queue[i].app_headsign_less_route = "<b>Streetcar</b> "+filtered_queue[i].headsign.replace("Portland Streetcar","");		
			filtered_queue[i].app_color = 'streetcar'
		} else if (filtered_queue[i].route_id == "196") {
			filtered_queue[i].app_route_id = "S";
			filtered_queue[i].app_headsign_less_route = "<b>Streetcar</b> "+filtered_queue[i].headsign.replace("Portland Streetcar","");		
			filtered_queue[i].app_color = 'streetcar'
		} else if (filtered_queue[i].route_id == "293") {
			filtered_queue[i].app_route_id = "SH";
			filtered_queue[i].app_headsign_less_route = "<b>Streetcar</b> "+filtered_queue[i].headsign.replace("Portland Streetcar","");		
			filtered_queue[i].app_color = 'streetcar'
		} else {		
			var route_name = filtered_queue[i].route_data.route_short_name || filtered_queue[i].route_data.route_long_name;
			filtered_queue[i].app_route_id = route_name;
			filtered_queue[i].app_headsign_less_route = filtered_queue[i].headsign.replace(route_name,"");
			filtered_queue[i].app_color = filtered_queue[i].route_data.service_class;
		}
		
		if (filtered_queue[i].agency == 'PCC') {
			filtered_queue[i].app_route_id = "PCC";
		}
		
		// highlight terminus
		if (filtered_queue[i].app_headsign_less_route.match(/ to /i)) {
			filtered_queue[i].app_headsign_less_route = filtered_queue[i].app_headsign_less_route.replace(/ to /i," to <span class=\"terminus\">")+"</span>";
		}
		
		/* logic for sort key
		
			for transit:
		
			crrrd
			
			c = service class
			rrr = route (3 digit max)
			d = direction (1 or 0)
			
			for car2go:
			
			9ddd0
			
			ddd= distance in 10th of mile units (multiply by 10, take floor)
		
		
		
		*/
		
		if (!by_trip[trip_identifier]) {
			by_trip[trip_identifier] = {};
			by_trip[trip_identifier].arrivals = [];
			by_trip[trip_identifier].stop_id = filtered_queue[i].stop_id;
			by_trip[trip_identifier].first_arrival_time = filtered_queue[i].arrivalTime;
			var service_class = filtered_queue[i].route_data.service_class;
			if (service_class > 7) {
				service_class = 7;
			}
			var direction_multiplier = 0;
			if (transitBoardByLine.split_by_direction) {
				direction_multiplier = 100000;
			} else {
				direction_multiplier = 1;
			}
			by_trip[trip_identifier].sort_key = 10*filtered_queue[i].route_id + 10000*service_class + direction_multiplier*filtered_queue[i].route_data.direction_id;
		}
		by_trip[trip_identifier].arrivals.push(filtered_queue[i]);
	}
	

	
	function trArrCompareArrivalSets(a,b) {
		return +by_trip[a].sort_key - +by_trip[b].sort_key;
	}
	

	var trip_keys = [];
	for (var key in by_trip) {
		trip_keys.push(key);
	}
	
	var sorted_trip_keys = trip_keys.sort(trArrCompareArrivalSets);
	
	var trip_objects = {};
	var trip_inner_html = {};
	var trip_arrivals_html = {};
	for (var i = 0; i < sorted_trip_keys.length; i++) {
		var trip_key = sorted_trip_keys[i];
		var trip_arrival = transitBoardByLine.formatted_arrival_time(by_trip[trip_key].arrivals[0])+"<br><span class=\"second_arrival\">";
		if (by_trip[trip_key].arrivals[1]) {
			trip_arrival += transitBoardByLine.formatted_arrival_time(by_trip[trip_key].arrivals[1])+"</span>";
		} else {
			trip_arrival += "&nbsp;</span>";
		}
		
		var trip_inner = '<tr valign="middle"><td class="route">'+by_trip[trip_key].arrivals[0].app_route_id+"</td>\n";
		trip_inner += '<td class="destination" valign="middle"><div>'+by_trip[trip_key].arrivals[0].app_headsign_less_route+" from "+by_trip[trip_key].arrivals[0].stop_data.stop_name.replace(" MAX Station","").replace(" MAX Stn","")+"</div></td>\n";
		trip_inner += "<td class=\"arrivals\">"+trip_arrival+"</td></tr>";
		
		var by_trip_html = "<table class=\""+trip_key+" trip_wrapper active bank_placeholder\" data-bank=\"bank_placeholder\" data-sortkey=\""+by_trip[trip_key].sort_key+"\" data-tripid=\""+trip_key+"\"><tbody class=\"trip service_color_"+by_trip[trip_key].arrivals[0].app_color+" route_"+by_trip[trip_key].arrivals[0].route_id+" direction_"+by_trip[trip_key].arrivals[0].route_data.direction_id+" agency_"+by_trip[trip_key].arrivals[0].agency+"\">\n";
		by_trip_html += trip_inner+"</tbody></table>";
		
		trip_objects[trip_key] = by_trip_html;
		trip_inner_html[trip_key] = trip_inner;
		trip_arrivals_html[trip_key] = trip_arrival;
	}			
		
	// now do spacers to get balanced columns
	
	var display_elements = sorted_trip_keys.length + parseInt(transitBoardByLine.car2go) + parseInt(transitBoardByLine.gbfs);
	if (transitBoardByLine.weather) {
		display_elements = display_elements + 1;
	}
	
	var remainder = display_elements % transitBoardByLine.columns;

	if (remainder > 0) {
		var spacer_inner = '\
					<tr valign="middle">\
						<td class="route"></td>\
						<td class="destination"><div></div></td>\
					</tr>\
		';
			
		for (i=1;i<=remainder;i++) {
			var spacer = '\
					<table class="trip_wrapper service_color_spacer spacer spacer'+i+' active bank_placeholder isotope-item" data-bank="bank_placeholder" data-tripid="spacer'+i+'" data-sortkey="95000">\
						<tbody class="trip service_color_spacer">\
						'+spacer_inner+'\
						</tbody>\
					</table>\
			';	
			var spacer_id = 'spacer'+i;			
			trip_objects[spacer_id] = spacer;
			trip_inner_html[spacer_id] = spacer_inner;
			sorted_trip_keys.push(spacer_id);
		}
	}
	
	var insertion_queue = [];
	var removal_queue = [];
	
	transitBoardByLine.shrink_destination = function(trip_id) {
		// reduce font size until there is no more overflow
		var trip = jQuery("."+trip_id+" td.destination div");
		if (trip.length > 0) {
			if (trip[0].scrollHeight - trip[0].clientHeight > 2) {
				var size = parseInt(jQuery(trip[0]).css('font-size'))-1;
				if (trip_id.match(/car2go/)) {
					// make sure all car2go elements are same font size
					jQuery(".car2go td.destination div").css('font-size',size+"px");
				} else if (trip_id.match(/gbfs/)) {
					// make sure all GBFS elements are same font size
					jQuery(".gbfs td.destination div").css('font-size',size+"px");
				} else {
					trip.css('font-size',size+"px");
				}
				setTimeout(function(){transitBoardByLine.shrink_destination(trip_id)}, 2000);
			}
		}
	}

	
	function process_insertions() {
		if (insertion_queue.length > 0) {
			var obj = insertion_queue.shift();
			jQuery.each(transitBoardByLine.banks,function(index,bank) {
				var obj_string = obj.replace(/bank_placeholder/g,bank);
				transitBoardByLine.isotope_container.isotope( 'insert', jQuery(obj_string) );
			});
			//get trip_id from obj and set up call to test overflow
			var matches = obj.match(/tripid="([^"]*)"/);
			if (matches.length > 1) {
				setTimeout(function(){transitBoardByLine.shrink_destination(matches[1])}, 2000);
			}
			process_insertions();
		} else {
			transitBoardByLine.isotope_container.isotope( 'reLayout' ).isotope();
			transitBoardByLine.animate_display();
		}
	}
	
	function process_removals() {
		if (removal_queue.length > 0) {
			var id = removal_queue.shift();
			transitBoardByLine.isotope_container.isotope( 'remove', jQuery("table."+id) );
			process_removals();
		} else {
			process_insertions();
		}
	}
	

	// see if we need to delete any elements
	jQuery("table.trip_wrapper.active").each(function(index,element){
		var id = jQuery(element).attr("data-tripid");
		if ( trip_objects[id] == null && !id.match(/car2go/) && !id.match(/gbfs/)  && !id.match(/weather/) ) {
			jQuery("table."+id).removeClass('active');
			removal_queue.push(id);
		}
	});
	
	// update or add items
	for(var id in trip_objects) {
		if (jQuery("table."+id).length > 0) {
			// update
			jQuery("table."+id).addClass('active');
			if (jQuery("table."+id+" td.arrivals").html() != trip_arrivals_html[id]) {
				jQuery("table."+id+" td.arrivals").html(trip_arrivals_html[id]);
			}
		} else {
			// add it
			insertion_queue.push(trip_objects[id]);
		}
	}
	
	// create/update GBFS tables
	if (transitBoardByLine.gbfs > 0) {
		var locations = transitBoardByLine.bikes.get_locations();
		//console.table(locations);
		
		for (i=0; i<transitBoardByLine.gbfs; i++) {
			if ( typeof locations[i] !== 'undefined') {

				var value = locations[i];
			  var bikes = "bikes";
			  if (value.num_bikes_available == 1) {
			    bikes = "bike";
			  }
			  var station = "BIKETOWN bike";
			  if (value.location_type == "station") {
			    station = '<span class="terminus">'+value.num_bikes_available+" "+bikes+"</span> at BIKETOWN Station";
			  }

				if (jQuery(".gbfs"+i).length == 0) {

					var car = '\
							<table class="gbfs gbfs'+i+' trip_wrapper active isotope-item bank_placeholder" data-sortkey="80000" data-bank="bank_placeholder" data-tripid="gbfs'+i+'">\
								<tbody class="trip service_color_gbfs">\
									<tr valign="middle">\
										<td class="route"><img src="../assets/images/gbfs/gbfs_vehicle.jpg"></td>\
										<td class="destination"><div>'+station+' - <span class="terminus">'+value.name+'</span></div></td>\
										<td class="arrivals">'+value.formatted_distance+'</td>\
									</tr>\
								</tbody>\
							</table>\
					';
					jQuery.each(transitBoardByLine.banks,function(index,bank) {
						var car_string = car.replace(/bank_placeholder/g,bank);
						transitBoardByLine.isotope_container.isotope( 'insert', jQuery(car_string) );
					});
					
				} else {
					jQuery('.gbfs'+i+' .destination div').html(station+' - <span class="terminus">'+value.name+'</span>');
					var trip = jQuery('.gbfs'+i+' .destination div');
					if (trip.length > 0) {
						if (trip[0].scrollHeight > trip[0].clientHeight) {
							var gbfs_class = 'gbfs'+i;
							setTimeout(function(){transitBoardByLine.shrink_destination(gbfs_class)}, 2000);
						}
					}
					jQuery('.gbfs'+i+' .arrivals').html(value.formatted_distance);
				}
			}
		}
		
		if (locations.length == 0) {
			// no bikes, kill off the display elements
			jQuery("table.trip_wrapper.active").each(function(index,element){
				var id = jQuery(element).attr("data-tripid");
				if ( trip_objects[id] == null && id.match(/gbfs/) ) {
					jQuery("table."+id).removeClass('active');
					removal_queue.push(id);
				}
			});
		}
		
	}	
	
	
	// create/update car2go tables
	if (transitBoardByLine.car2go > 0) {
	  
		var vehicles = transitBoardByLine.cars.get_vehicles();
		
		if (vehicles.length == 0) {
			// no bikes, kill off the display elements
			jQuery("table.trip_wrapper.active").each(function(index,element){
				var id = jQuery(element).attr("data-tripid");
				if ( trip_objects[id] == null && id.match(/car2go/) ) {
					jQuery("table."+id).removeClass('active');
					removal_queue.push(id);
				}
			});
		}		
		
		for (i=0; i<vehicles.length; i++) {
			if ( typeof vehicles[i] !== 'undefined') {
				var value = vehicles[i];
				var dist = value[1];
				if (dist < 0.1) {
					dist = 0.1;
				}
				var address = value[0];
				address = '<span class="terminus">'+address.replace("(","</span><br>(");
				if (address.indexOf("/span") == -1) {
					address = address + "</span>";
				}
				if (jQuery(".active.car2go"+i).length == 0) {
					var car = '\
							<table class="car2go car2go'+i+' trip_wrapper active isotope-item bank_placeholder" data-sortkey="80000" data-bank="bank_placeholder" data-tripid="car2go'+i+'">\
								<tbody class="trip service_color_car2go">\
									<tr valign="middle">\
										<td class="route"><img src="../assets/images/car2go/car2go_vehicle.jpg"></td>\
										<td class="destination"><div>Car2Go - '+address+'</div></td>\
										<td class="arrivals">'+dist.toFixed(1)+' mi</td>\
									</tr>\
								</tbody>\
							</table>\
					';
					jQuery.each(transitBoardByLine.banks,function(index,bank) {
						var car_string = car.replace(/bank_placeholder/g,bank);
						transitBoardByLine.isotope_container.isotope( 'insert', jQuery(car_string) );
					});
					
				} else {
					jQuery('.car2go'+i+' .destination div').html("Car2Go - "+address);
					var trip = jQuery('.car2go'+i+' .destination div');
					if (trip.length > 0) {
						if (trip[0].scrollHeight > trip[0].clientHeight) {
							var car2go_class = 'car2go'+i;
							setTimeout(function(){transitBoardByLine.shrink_destination(car2go_class)}, 2000);
						}
					}
					jQuery('.car2go'+i+' .arrivals').html(dist.toFixed(1)+' mi');
				}
			}
		}
	}
	

	
	if (transitBoardByLine.weather) {
		if (transitBoardByLine.forecast.weather_is_current()) {
			if (jQuery(".weather").length == 0) {
				var sortkey = "90000";
				if (transitBoardByLine.weather == "top") {
					sortkey = "00000";
				}
				// create entries
				var weather = '\
						<table class="weather trip_wrapper active isotope-item bank_placeholder" data-sortkey="'+sortkey+'" data-bank="bank_placeholder" data-tripid="weather">\
							<tbody class="trip service_color_weather">\
								<tr valign="middle">\
									<td class="route">'+transitBoardByLine.forecast.get_icon()+'</td>\
									<td class="destination"><div><span class="terminus">'+transitBoardByLine.forecast.get_summary_forecast()+'</span></div></td>\
									<td class="arrivals">'+transitBoardByLine.forecast.get_temperature()+'</td>\
								</tr>\
							</tbody>\
						</table>\
				';
				jQuery.each(transitBoardByLine.banks,function(index,bank) {
					var weather_string = weather.replace(/bank_placeholder/g,bank);
					transitBoardByLine.isotope_container.isotope( 'insert', jQuery(weather_string) );
				});
			} else {
				// update the entries
				jQuery("table.trip_wrapper.active").each(function(index,element){
					jQuery('.weather .route').html(transitBoardByLine.forecast.get_icon());
					jQuery('.weather td.destination div span').html(transitBoardByLine.forecast.get_summary_forecast());
					jQuery('.weather .arrivals').html(transitBoardByLine.forecast.get_temperature());
				});
			}
		} else {
			// remove the entries, they're not current
			jQuery("table.trip_wrapper.active").each(function(index,element){
				var id = jQuery(element).attr("data-tripid");
				if ( id.match(/weather/) ) {
					jQuery("table."+id).removeClass('active');
					removal_queue.push(id);
				}
			});
		}
	}
		
	
	process_removals();
	
	transitBoardByLine.connection_health = data.connectionHealth;
	
	// set time 
        // Don't just use new Date() because time zone may be set wrong
	var client_time = localTime();
    var client_time_formatted = client_time.toString('h:mmtt');
    
	client_time_formatted = client_time_formatted.replace(/^0:/,'12:');
	jQuery('#tb_clock').html(client_time_formatted);
	
}

function filter_queue(arrivalsQueue) {
					
	var now = localTime();
	now = now.getTime(); //milliseconds since epoch				
	
	var tmp_queue = [];
	// removes everything before now and greater than 24 hours from now
	// also filter downtown only if desired
	
	for (var i = 0; i < arrivalsQueue.length; i++) {
		var milliseconds_until_arrival = arrivalsQueue[i].arrivalTime - now;
		if (milliseconds_until_arrival >= 0 && milliseconds_until_arrival <= 24*60*60*1000) {
			if ( arrivalsQueue[i].headsign.match(/downtown only/i) == null || !transitBoardByLine.suppress_downtown_only ) {
				tmp_queue.push(arrivalsQueue[i]);
			}
		}
	}

	// split rows into <= 60 min and > 60 min
	var next_hour = [];
	var later = [];
	for (var i = 0; i < tmp_queue.length; i++) {
		var milliseconds_until_arrival = tmp_queue[i].arrivalTime - now;
		if (milliseconds_until_arrival <= transitBoardByLine.minutes_limit*60*1000) {
			next_hour.push(tmp_queue[i]);
		} else {
			later.push(tmp_queue[i]);
		}
	}

	if (next_hour.length > 0) {
		return next_hour;
	} else {
		return later;
	}

}


head.ready(function() {
	
	// early parsing of query string
	
	function getQueryVariable(variable) {
    var query = window.location.search.substring(1);
    var vars = query.split('&');
    for (var i = 0; i < vars.length; i++) {
        var pair = vars[i].split('=');
        if (decodeURIComponent(pair[0]) == variable) {
            return decodeURIComponent(pair[1]);
        }
    }
    return "";
	}
	
	var bugsnag = getQueryVariable("option[bugsnag]") == true;
	bugsnag = false;
	//console.log("bugsnag: "+bugsnag);
	
	// set up error handler if not on development site
	
	if (!bugsnag) {
		var handler_url = "http://transitappliance.com/cgi-bin/js_error.pl";
		if (transitBoardByLine.is_development) {
			handler_url = "http://transitappliance.com/cgi-bin/js_error_dev.pl";
		}
		
		//console.log("initialize tracekit");
			
		TraceKit.report.subscribe(function (stackInfo) {   
			var serialized_stack = JSON.stringify(stackInfo);
			if (serialized_stack.match(/tracekit/)) {
				// don't track self-referential tracekit errors
			} else if (stackInfo.message.match(/Timezone/i)) {
				jQuery.ajax({
				    url: handler_url,
				    type: 'POST',
				    data: {
						  	applicationName: 			transitBoardByLine.APP_NAME,
						  	applicationVersion: 	transitBoardByLine.APP_VERSION,
						  	applicationId: 				transitBoardByLine.APP_ID,
						  	applianceId:					transitBoardByLine.appliance_id || "Unassigned",
				        browserUrl: 					window.location.href,
				        codeFile:							stackInfo.url,
				        message:							"TZ1: Timezone error, restarting application: "+stackInfo.message,
				        userAgent: 						navigator.userAgent,
				        stackInfo: 						serialized_stack
				    }
				});
				
				setTimeout(function(){
					// restart app
					location.reload(true);
				},2000);
				
			} else {
				jQuery.ajax({
				    url: handler_url,
				    type: 'POST',
				    data: {
						  	applicationName: 			transitBoardByLine.APP_NAME,
						  	applicationVersion: 	transitBoardByLine.APP_VERSION,
						  	applicationId: 				transitBoardByLine.APP_ID,
						  	applianceId:					transitBoardByLine.appliance_id || "Unassigned",
				        browserUrl: 					window.location.href,
				        codeFile:							stackInfo.url,
				        message:							stackInfo.message,
				        userAgent: 						navigator.userAgent,
				        stackInfo: 						serialized_stack
				    }
				});
			}
		});
		
		// throw new Error("Startup Event");
	}
	
	if (bugsnag) {
		var s = document.createElement("script");
		s.type = "text/javascript";
		s.src = "//d2wy8f7a9ursnm.cloudfront.net/bugsnag-3.min.js";
		s.setAttribute("data-apikey", "e2c233a964c42f28c66aedde079503e8");
		$("head").append(s);
		console.log("appended bugsnag");
	}
	
	
  trArr({
  	applicationName: 			transitBoardByLine.APP_NAME,
  	applicationVersion: 	transitBoardByLine.APP_VERSION,
  	applicationId: 				transitBoardByLine.APP_ID,
  	assetsDir:						"../assets",
  	configString: 				window.location.search, // use the query string
  	displayInterval: 			40*1000, //milliseconds
  	initializeCallback: 	transitBoardByLine.initializePage,
  	displayCallback: 			transitBoardByLine.displayPage
  });
});
				