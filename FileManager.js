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

//References
//https://www.neontribe.co.uk/cordova-file-plugin-examples/
//https://github.com/apache/cordova-plugin-file
//https://www.html5rocks.com/en/tutorials/file/filesystem/
var FileManager = (function(){
	//private area
	var self = {
		logging: false,
		rootDir: null
	};
	
	return {
		ErrorFs: function(e){
			var msg = '';
			
			switch (e.code) {
				case FileError.QUOTA_EXCEEDED_ERR:
					msg = 'QUOTA_EXCEEDED_ERR';
					break;
				case FileError.NOT_FOUND_ERR:
					msg = 'NOT_FOUND_ERR';
					break;
				case FileError.SECURITY_ERR:
					msg = 'SECURITY_ERR';
					break;
				case FileError.INVALID_MODIFICATION_ERR:
					msg = 'INVALID_MODIFICATION_ERR';
					break;
				case FileError.INVALID_STATE_ERR:
					msg = 'INVALID_STATE_ERR';
					break;
				default:
					msg = 'Unknown Error:'+e.toString();
					break;
			};
			
			console.log("filesystem error("+e.code+"): "+msg);
		},
		
		move: function(moveObj, destObj, callback){
			moveObj.moveTo(
				destObj,
				moveObj.name,
				callback,
				function(e){
					console.log("error moving:"+FileManager.urlFromFileEntry(moveObj)+" to "+FileManager.urlFromDirectoryEntry(destObj));
					FileManager.ErrorFs(e);
				}
			);
		},
		
		copy: function(sourceObj, destObj, callback){
			sourceObj.copyTo(
				destObj,
				sourceObj.name,
				callback,
				function(e){
					console.log("error copying:"+FileManager.urlFromFileEntry(sourceObj)+" to "+FileManager.urlFromDirectoryEntry(destObj));
					FileManager.ErrorFs(e);
				}
			);
		},
		
		rename: function(oldObj, newName, callback){
			oldObj.getParent(
				function(dirObj){
					oldObj.moveTo(
						dirObj,
						newName,
						callback,
						function(e){
							console.log("error renaming:"+FileManager.urlFromFileEntry(oldObj)+" to "+FileManager.urlFromDirectoryEntry(dirObj)+" : "+newName);
							FileManager.ErrorFs(e);
						}
					);
				},
				function(e){
					console.log("error fetching parent of:"+FileManager.urlFromFileEntry(oldObj));
					FileManager.ErrorFs(e);
				}
			);
		},
		
		//dir can be a string or a DirectoryEntry object
		getDirectory: function(dir, callback, dirObj){
			if(typeof(cordova.file.dataDirectory) === 'undefined'){
				if(self.logging){
					console.log("no data directory");
				}
				return false;
			}
			
			if(typeof(dirObj) === 'undefined'){
				dirObj = null;
			}
			
			var finished = function(){
				if(dirObj === null){
					dirObj = self.rootDir;
				}
				if(dir === null){
					return dirObj;
				}
				if(self.logging){
					console.log("get dir: "+dir);
				}
				//if dir is relative
				if(dir.search("file:///") < 0){
					dirObj.getDirectory(
						dir,
						{create:true},
						callback,
						function(e){
							console.log("failed to get dir:"+dirObj.name+" - "+dir);
							FileManager.ErrorFs(e);
						}
					);
				}
				//if dir is url
				else{
					window.resolveLocalFileSystemURL(
						dir,
						callback,
						function(e){
							console.log("error resolving: "+dir);
							FileManager.ErrorFs(e);
						}
					);
				}
			};
			if(dirObj === null && self.rootDir === null){
				window.resolveLocalFileSystemURL(
					cordova.file.dataDirectory,
					function(dirEntry){
						if(self.logging){
							console.log("get file plugin directory ("+cordova.file.dataDirectory+")");
						}
						self.rootDir = dirEntry;
						dirObj = dirEntry;
						finished();
					},
					function(e){
						console.log("error resolving cordova data directory: "+cordova.file.dataDirectory);
						FileManager.ErrorFs(e);
					}
				);
			}
			else{
				finished();
			}
			return true;
		},
		
		deleteDirectory: function(dir,callback){
			var remove = function(dirEntry){
				dirEntry.removeRecursively(
					function(){
						if(self.logging){
							console.log('Directory '+dirEntry.name+' removed.');
						}
						if(typeof(callback) === 'function'){
							callback();
						}
					},
					function(e){
						console.log("error removing recursively:"+FileManager.urlFromFileEntry(dirEntry));
						FileManager.ErrorFs(e);
					}
				);
			};
			if(typeof(dir) !== 'string'){
				remove(dir);
				return;
			}
			FileManager.getDirectory(
				dir,
				remove
			);
		},
		
		getFile: function(folderObj, fileName, callback, error){
			var fetch = function(dirObj){
				if(self.logging){
					console.log("fetch file: "+folderObj.name+"/"+fileName);
				}
				dirObj.getFile(
					fileName,
					{create: false, exclusive: false},
					callback,		//a fileEntry object will be passed as the first and only parameter
					function(e){
						if(typeof(error) === 'function'){
							error(e,FileManager.urlFromFileEntry(folderObj)+fileName);
						}
						else{
							console.log("get file fail: "+FileManager.urlFromFileEntry(folderObj)+fileName);
							FileManager.ErrorFs(e);
						}
					}
				);
			};
			if(folderObj === null){
				FileManager.getDirectory(
					null,
					function(dirObj){
						fetch(dirObj);
					}
				);
				return;
			}
			fetch(folderObj);
		},
		
		saveFile: function(folderObj, fileName, fileData, dataTypeObj, callback){
			folderObj.getFile(
				fileName,
				{create: true, exclusive: false},
				function(fileEntry){
					// Create a FileWriter object for our FileEntry
					fileEntry.createWriter(
						function(fileWriter){
							fileWriter.onwriteend = function(){
								if(self.logging){
									console.log("Successful file write: " + fileEntry.toURL());
								}
								if(typeof(callback) === 'function'){
									callback();
								}
							};
							fileWriter.onerror = function(e){
								console.log("error saving file 2: "+FileManager.urlFromFileEntry(folderObj)+" /"+fileName);
								FileManager.ErrorFs(e);
							};
							//write the data in the appropriate format
							if(typeof(dataTypeObj) === 'undefined' || !dataTypeObj){
								dataTypeObj = {type: "text/plain"};
							}
							var blob = null;
							if(dataTypeObj == "blob"){
								blob = fileData;
							}
							else{
								blob = new Blob([fileData],dataTypeObj);
							}
							fileWriter.write(blob);
						}
					);
				},
				function(e){
					console.log("error saving file 1: "+FileManager.urlFromFileEntry(folderObj)+" /"+fileName);
					FileManager.ErrorFs(e);
				}
			);
		},
		
		stringFromFileEntry: function(fileObj,callback){
			fileObj.file(
				function (file) {
			        var reader = new FileReader();
			
			        reader.onloadend = function() {
			        	if(self.logging){
			            	console.log("Successful file read: " + fileObj.name);
			        	}
			            callback(this.result);
			        };
			
			        reader.readAsText(file);
			    },
			    function(e){
					console.log("error converting file to string: "+FileManager.urlFromFileEntry(fileObj));
					FileManager.ErrorFs(e);
				}
		    );
		},
		
		//function result contains trailing slash
		urlFromDirectoryEntry: function(folderObj,callback){
			if(typeof(folderObj) === 'undefined' || folderObj === null){
				if(self.rootDir !== null){
					folderObj = self.rootDir;
				}
				else{
					if(typeof(callback) === 'function'){
						callback(false);
					}
					return false;
				}
			}
			return FileManager.urlFromFileEntry(folderObj,callback);
		},
		
		urlFromFileEntry: function(fileObj,callback){
			var url = fileObj.toURL();
			if(typeof(callback) === 'function'){
				callback(url);
			}
			return url;
		}
	};
})();

function newFileTransfer(){
	var self = this;
	var request = null;
	var aborted = false;
	
	var destpath = "";
	var filename = "";
	
	var success = null;
	var fail = null;
	
	var onResponse = function(e){
		var blob = request.response; // Note: not request.responseText
		if(request.status == 200 && blob) {
			var contentType = request.getResponseHeader("content-type");
			saveFile(blob,contentType);
		}
		else{
			fail(request.status);
		}
	};
	
	var saveFile = function(blob,contentType){
		FileManager.getDirectory(
			destpath,
			function(dirObj){
				FileManager.saveFile(
					dirObj,
					filename,
					blob,
					"blob",
					success
				);
			}
		);
	};
	
	this.download = function(sourceURL,destinationPath,fileName,onSuccess,onFail){
		success = onSuccess;
		fail = onFail;
		filename = fileName;
		destpath = destinationPath;
		
		request = new XMLHttpRequest();
		request.open("GET",sourceURL,true);
		request.responseType = "blob";
		request.timeout = 30000;		//timeout after 30 seconds of trying to get file
		request.onreadystatechange = function(e){
			if(this.readyState == 4){
				onResponse(e)
			}
		};
		request.send(null);
	};
	
	this.abort = function(){
		if(!request){
			return false;
		}
		aborted = true;
		request.abort();
		return true;
	};
};
