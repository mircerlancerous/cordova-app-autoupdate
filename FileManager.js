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
					msg = 'Unknown Error';
					break;
			};
			
			console.log("filesystem error("+e.code+"): "+msg);
		},
		
		move: function(moveObj, destObj, callback){
			moveObj.moveTo(
				destObj,
				moveObj.name,
				callback,
				FileManager.ErrorFs
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
						FileManager.ErrorFs
					);
				},
				FileManager.ErrorFs
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
						FileManager.ErrorFs
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
					FileManager.ErrorFs
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
					self.ErrorFs
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
			if(typeof(error) !== 'function'){
				error = FileManager.ErrorFs;
			}
			var fetch = function(dirObj){
				if(self.logging){
					console.log("fetch file: "+folderObj.name+"/"+fileName);
				}
				dirObj.getFile(
					fileName,
					{create: false, exclusive: false},
					callback,		//a fileEntry object will be passed as the first and only parameter
					error
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
		
		saveFile: function(folderObj, fileName, fileData, dataTypeObj){
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
							};
							fileWriter.onerror = function(e){
								if(self.logging){
									console.log("Failed file write: " + e.toString());
								}
							};
							//write the data in the appropriate format
							if(typeof(dataTypeObj) === 'undefined'){
								dataTypeObj = {type: "text/plain"};
							}
							var blob = new Blob([fileData],dataTypeObj);
							fileWriter.write(blob);
						}
					);
				},
				FileManager.ErrorFs
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
			    FileManager.ErrorFs
		    );
		},
		
		//function result contains trailing slash
		urlFromDirectoryEntry: function(folderObj,callback){
			if(typeof(folderObj) === 'undefined' || folderObj === null){
				if(self.rootDir !== null){
					folderObj = self.rootDir;
				}
				else{
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
