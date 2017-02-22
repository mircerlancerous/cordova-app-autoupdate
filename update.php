<?php
/*
Copyright 2017 OffTheBricks - https://github.com/mircerlancerous/cordova-app-autoupdate
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

function JSONversion($outpath,$sub="/"){
	if(!file_exists($outpath)){
		return FALSE;
	}
	$obj = array();
	$list = scandir($outpath.$sub);
	foreach($list as $file){
		if($file == "." || $file == ".."){
			continue;
		}
		$itemObj = new FileVersion();
		$itemObj->name = $file;
		if(is_dir($outpath.$sub.$file)){
			$itemObj->content = JSONversion($outpath,$sub.$file."/");
		}
		else{
			$itemObj->version = filemtime($outpath.$sub.$file);
		}
		$obj[] = $itemObj;
	}
	return $obj;
}

class FileVersion{
	public $name;
	public $version = 0;
	public $content = NULL;
}

###############################################################################

define("DOCROOT","/home/myaccount/AppFiles/");
//check if there is a request for a JSON version report
if(!isset($_GET['version']) && !isset($_GET['file'])){
	echo "false";exit;
}
$outpath = DOCROOT.$_GET['version'];
if(!file_exists($outpath)){
   echo "false";exit;
}
//if we just want the version info
if(!isset($_GET['file'])){
	$obj = JSONversion($outpath);
	$obj = json_encode($obj);		//switch this to CJSON later
	header('Content-type: application/json; charset=utf-8');
	header('Content-Length: '.strlen($obj));
	echo $obj;
}
//if we want the file
else{
	$file = $_GET['file'];
	$outpath .= "/" . $file;
	$ext = substr($file,strrpos($file,".")+1);
	$ext = strtolower($ext);
	$image = FALSE;
	switch($ext){
		case 'jpeg':
		case 'jpg':
		case 'gif':
		case 'png':
			$info = getimagesize($outpath);
			$mime = $info['mime'];
			header("Content-type: ".$mime);
			break;
		case 'html':
		case 'htm':
			header("Content-type: text/html");
			break;
		case 'js':
			header("Content-type: application/javascript");
			break;
		case 'css':
			header("Content-type: text/css");
			break;
	}
	
	readfile($outpath);
}
?>
