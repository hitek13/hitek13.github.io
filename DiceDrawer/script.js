$(document).ready(function(){
	$('.knob').click(function(){
		$('.drawerbox').toggleClass('close');
		$('.drawerwall').toggleClass('close');
		$('.knob').toggleClass('close');
	});
	
	/*$(document).mousedown(function(){
		let drawerHeith;
		$(document).on( "mousemove",function(){
			drawerHeith = event.pageY-100;
			$('.drawerbox').height(drawerHeith);
		});
	});*/
	
});