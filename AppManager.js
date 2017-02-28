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

var AppManager = (function(){
	//private area
	var self = {
		logging: false,
		updateURL: "",    //enter your app's update server url here
		autoUpdate: true,
		
		dirPrefix: "AppFiles",		//do NOT change this value as it is hard-coded throughout...oops
		oldBase: "",
		versionFile: "version.json",
		versionObj: null,
		Directories: {},
		
		insertStack: 0,		//for checking whether we're still inserting HTML links before we start erasing files
		updateStack: 0,		//for checking whether we're still downloading the update or not
		updateReady: false,
		
		//do NOT change these values as they are hard-coded throughout
		Folders: [
			"older",
			"current",
			"newest"
		],
		
		FetchFolders: function(){
			var length = Object.getOwnPropertyNames(self.Directories).length;
			if(length > self.Folders.length){
				//check for version rollback command
				if(1==2){
					self.rollback();
				}
				//if no rollback needed
				else{
					self.getVersion();
				}
				return;
			}
			
			var dir = self.dirPrefix;
			if(length > 0){
				dir += "/"+self.Folders[length-1];
			}
			var callback = function(dirObj){
		//		console.log("got folder: "+dir);
				dir = dir.split("/");
				if(dir.length == 1){
					dir = self.dirPrefix;
				}
				else{
					dir = dir[1];
				}
				self.Directories[dir] = dirObj;
				self.FetchFolders();
			};
		//	console.log("please get "+dir);
			FileManager.getDirectory(dir,callback);
		},
		
		getVersion: function(){
			if(self.logging){
				console.log("getting version:"+JSON.stringify(Object.getOwnPropertyNames(self.Directories)));
			}
			//if current version found
			var success = function(fileObj){
				//compare the versions
				FileManager.stringFromFileEntry(
					fileObj,
					function(currentStr){
						//set current version
						self.versionObj = JSON.parse(currentStr);
						//apply the current version
						self.apply();
					}
				);
			};
			//if no current version, or error
			var error = function(e){
				if(e.code !== FileError.NOT_FOUND_ERR){
					//other issue so send to file manager error handler
					FileManager.ErrorFs(e);
					return;
				}
				if(self.logging){
					console.log("version file not found");
				}
				//check for new version - this is likely the first load of the app
				self.updatingSuspended(
					function(suspended){
						if(!suspended){
							self.check();
						}
					}
				);
			};
			//fetch current file
			FileManager.getFile(
				self.Directories.current,
				self.versionFile,
				success,
				error
			);
		},
		
		performUpdate: function(serverObj){
			var serverStr = JSON.stringify(serverObj);
			//if there is no current version
			if(self.versionObj === null){
				if(self.logging){
					console.log("first download");
				}
				//file isn't found so just save our object there
				FileManager.saveFile(
					self.Directories.current,
					self.versionFile,
					serverStr
				);
				self.versionObj = serverObj;
				//download all files to the current folder
				self.fetchFiles(
					serverObj,
					self.Directories.current,
					self.insertIntoHTML
				);
				return;
			}
			
			if(serverStr === JSON.stringify(self.versionObj)){
				//no changes
				if(self.logging){
					console.log("no changes");
				}
				return;
			}
			
			//update required
			if(self.logging){
				console.log("changes needed\r\n"+JSON.stringify(self.versionObj));
			}
			//save our new version file to the newest folder
			FileManager.saveFile(
				self.Directories.newest,
				self.versionFile,
				serverStr
			);
			//download all files to the newest folder
			self.fetchFiles(
				serverObj,
				self.Directories.newest,
				function(){
					if(self.logging){
						console.log("update ready");
					}
					//if we want to auto-apply
					if(self.autoUpdate){
						AppManager.reload();
					}
					//if we want to control when the app is updated
					else{
						self.updateReady = true;
					}
				}
			);
		},
		
		rollback: function(){
			//delete newest folder
			
			//delete current folder
			
			//rename older folder to current
			
			//suspend updates for now
			AppManager.suspendUpdates();
		},
		
		//only fetch files which are missing - in case of previously interrupted update download
		fetchFiles: function(arr,folderObj,callback){
			var root = false;
			if(typeof(callback) !== 'undefined'){
				root = true;
				if(self.logging){
					console.log("fetching files");
				}
			}
			self.updateStack++;
			
			for(var i=0; i<arr.length; i++){
				//if file
				if(arr[i].content === null){
					var fetch = (function(){
						var name = arr[i].name;
						return function(e){
							if(e.code !== FileError.NOT_FOUND_ERR){
								//other issue so send to file manager error handler
								FileManager.ErrorFs(e);
								return;
							}
							//download the file as it's missing
							var url = FileManager.urlFromDirectoryEntry(folderObj);
							var pos = url.indexOf(self.dirPrefix);
							pos += self.dirPrefix.length + 1;
							url = url.substring(pos);
							pos = url.indexOf("/");
							if(pos > -1){
								url = url.substring(pos);
							}
							url = self.updateURL + "&file=" + encodeURIComponent(url + name);
							if(self.logging){
								console.log("file url: "+url);
							}
							self.updateStack++;
							var fileTransfer = new FileTransfer();		//filetransfer plugin - https://github.com/apache/cordova-plugin-file-transfer
							fileTransfer.download(
								url,
								FileManager.urlFromDirectoryEntry(folderObj) + name,
								function(){
							//		console.log("downloaded: "+name);
									self.updateStack--;
								},
								function(error) {
									console.log("download error source " + error.source);
									console.log("download error target " + error.target);
									console.log("download error code" + error.code);
								},
								true/*,		//trust all hosts
								[options]*/
							);
						};
					})();
					//attempt to fetch the file - if successful, do nothing, otherwise download it
					FileManager.getFile(
						folderObj,
						arr[i].name,
						function(){},
						fetch
					);
				}
				//if folder
				else{
					var fetch = (function(){
						var content = arr[i].content;
						return function(dirObj){
							self.fetchFiles(content,dirObj);
						};
					})();
					FileManager.getDirectory(
						arr[i].name,
						fetch,
						folderObj
					);
				}
			}
			
			self.updateStack--;
			if(root){
				//code loaded so initialize app
				var init = function(){
					if(self.updateStack > 0){
						setTimeout(init,100);
						return;
					}
					callback();
				};
				setTimeout(init,100);
			}
		},
		
		updatingSuspended: function(callback){
			callback(false);		//todo
		},
		
		check: function(){
			//get server version
			var xmlhttp = new XMLHttpRequest();
			xmlhttp.onreadystatechange = function(){
				if(this.readyState == 4){
					if(this.status == 200){
						var obj = null;
						try{
							obj = JSON.parse(this.responseText);
						}
						catch(e){
							//do nothing for now
						}
						if(obj !== null){
							if(self.logging){
								console.log(this.responseText);
							}
							//compare and update where needed
							self.performUpdate(obj);
						}
					}
					else{
						//no or invalid connection so no update
					}
				}
			};
			xmlhttp.open("GET",self.updateURL,true);
			xmlhttp.send();
		},
		
		insertIntoHTML: function(folderObj,arr){
			self.insertStack++;
			var root = false;
			if(typeof(folderObj) === 'undefined'){
				root = true;
				folderObj = self.Directories.current;
				arr = self.versionObj;
				if(self.logging){
					console.log("begin html insert ("+arr.length+")");
				}
			}
			
			var urlCallback = null;
			for(var i=0; i<arr.length; i++){
				//if file
				if(arr[i].content === null){
					doneCallback = null;
					var type = arr[i].name.lastIndexOf(".");
					type = arr[i].name.substring(type+1);
					//if css
					if(type == 'css'){
						urlCallback = function(url){
							var newLink = document.createElement("link");
							newLink.rel = "stylesheet";
							newLink.href = url;
							document.head.appendChild(newLink);
						};
					}
					//if javascript
					else if(type == 'js'){
						urlCallback = function(url){
							var newScript = document.createElement("script");
							newScript.src = url;
							document.head.appendChild(newScript);
						};
					}
					//if other
					else{
						//do nothing; file will be accessed through AppManager.getFileURL function
					}
					if(urlCallback !== null){
						if(self.logging){
							console.log("start html insert: "+arr[i].name);
						}
						self.insertStack++;
						FileManager.getFile(
							folderObj,
							arr[i].name,
							function(fileObj){
								if(self.logging){
									console.log("html insert: "+fileObj.name+" - "+url);
								}
								var url = FileManager.urlFromFileEntry(fileObj);
								urlCallback(url);
								self.insertStack--;
							}
						);
					}
				}
				//if folder
				else{
					var fetch = (function(){
						var content = arr[i].content;
						return function(dirObj){
							self.insertIntoHTML(dirObj,content);
						};
					})();
					FileManager.getDirectory(
						arr[i].name,
						fetch,
						folderObj
					);
				}
			}
			
			self.insertStack--;
			
			if(root){
				//code loaded so initialize app
				var init = function(){
					if(self.insertStack > 0){
						setTimeout(init,100);
						return;
					}
					self.initApp();
				};
				setTimeout(init,100);
				//check server for new version
				self.updatingSuspended(
					function(suspended){
						if(!suspended){
							self.check();
						}
					}
				);
			}
		},
		
		apply: function(){
			//if new version found in newest
			var success = function(fileObj){
				var newestObj = FileManager.stringFromFileEntry(
					fileObj,
					function(str){
						if(self.logging){
							console.log("applying update");
						}
						//delete older directory
						FileManager.deleteDirectory(
							self.Directories.older,
							function(){
								delete self.Directories.older;
								//rename current to older
								FileManager.rename(
									self.Directories.current,
									"older",
									function(){
										//reset older reference
										FileManager.getDirectory(
											"older",
											function(dirObj){
												self.Directories.older = dirObj;
											},
											self.Directories.AppFiles
										);
										//rename newest to current
										FileManager.rename(
											self.Directories.newest,
											"current",
											function(){
												//assign new version info to the version object
												self.versionObj = JSON.parse(str);
												//reset newest reference
												FileManager.getDirectory(
													"newest",
													function(dirObj){
														self.Directories.newest = dirObj;
													},
													self.Directories.AppFiles
												);
												//reset current reference
												FileManager.getDirectory(
													"current",
													function(dirObj){
														self.Directories.current = dirObj;
														//load new current
														self.insertIntoHTML();
													},
													self.Directories.AppFiles
												);
											}
										);
									}
								);
							}
						);
					}
				);
			};
			//if no newest version, or error
			var error = function(e){
				if(e.code !== FileError.NOT_FOUND_ERR){
					//other issue so send to file manager error handler
					FileManager.ErrorFs(e);
					return;
				}
				//no newest version so load current
				self.insertIntoHTML();
			};
			//check newest folder for new version
			FileManager.getFile(
				self.Directories.newest,
				self.versionFile,
				success,
				error
			);
		},
		
		Ready: function(){
			//only use the app manager if this code is actually running in an app
			if(AppManager.isApp){
				FileManager.getDirectory(
					self.dirPrefix + "/current/",
					function(folderObj){
						self.oldBase = document.baseURI;
						var baseElm = document.createElement("base");
						baseElm.href = FileManager.urlFromDirectoryEntry(folderObj);
						document.head.appendChild(baseElm);
					}
				);
				self.FetchFolders();
			}
			else{
				self.initApp();
			}
		},
		
		initApp: function(){
			if(typeof(navigator.splashscreen) !== 'undefined'){
				setTimeout(function() {
				    navigator.splashscreen.hide();
				}, 500);
			}
			if(typeof(window.app) !== 'undefined' && typeof(app.initialize) === 'function'){
				app.initialize();
			}
		}
	};
	
	//public area
	return {
		isApp: true,
		// Application Constructor
		initialize: function() {
			var check = document.URL.indexOf( 'http://' ) === -1 && document.URL.indexOf( 'https://' ) === -1;
			if(check){
				document.addEventListener('deviceready', self.Ready, false);
			}
			else{
				AppManager.isApp = false;
				window.addEventListener('load', self.Ready, false);
			}
		},
		
		suspendUpdates: function(){
			
		},
		
		restoreUpdates: function(){
			
		},
		
		reload: function(){
			if(typeof(navigator.splashscreen) !== 'undefined'){
				navigator.splashscreen.show();		//hidden onDeviceReady
			}
			//document.location = self.oldBase;
			// Reload the current page, without using the cache
			setTimeout(
				function(){
					window.location.reload(true);
				},
				1000
			);
		},
		
		getFileURL: function(path,callback){
			var pos = path.lastIndexOf("/");
			var file = path.substring(pos+1);
			path = path.substring(0,pos);
			FileManager.getDirectory(
				path,
				function(folderObj){
					FileManager.getFile(
						folderObj,
						file,
						function(fileObj){
							var url = FileManager.urlFromFileEntry(fileObj);
							callback(url);
						}
					);
				},
				self.Directories.current
			);
		}
	};
})();

AppManager.initialize();
