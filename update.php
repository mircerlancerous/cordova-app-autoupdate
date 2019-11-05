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

function enable_cors() {

    // Allow from any origin
    if (isset($_SERVER['HTTP_ORIGIN'])) {
        // Decide if the origin in $_SERVER['HTTP_ORIGIN'] is one
        // you want to allow, and if so:
        header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
        //header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');    // cache for 1 day
    }

    // Access-Control headers are received during OPTIONS requests
    if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {

        if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']))
            // may also be using PUT, PATCH, HEAD etc
            header("Access-Control-Allow-Methods: GET, POST, OPTIONS");         

        if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']))
            header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}");

        exit(0);
    }
}

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

enable_cors();
	
//check if there is a request for a JSON version report
if(!isset($_GET['version']) && !isset($_GET['file'])){
	echo "false";exit;
}
$outpath = "/home/myaccount/AppFiles/".$_GET['version'];
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
	header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
	header("Cache-Control: post-check=0, pre-check=0", false);
	header("Pragma: no-cache");
	
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
		default:
			exit;	//don't allow download of file types that aren't explicitely allowed
	}
	
	@readfile($outpath);
}
?>
