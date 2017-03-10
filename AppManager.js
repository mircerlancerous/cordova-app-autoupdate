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

/*
Plugin list:
https://github.com/apache/cordova-plugin-file-transfer
https://github.com/MobileChromeApps/cordova-plugin-zip		-not yet implemented
*/

var AppManager = (function(){
	//private area
	var config = {
		autoUpdate: true,
		logging: false,
		updateURL: "", //enter your app's update server url here
		versionFile: "version.json",
		dirPrefix: "AppFiles"
	};
	
	var self = {
		oldBase: "",
		versionObj: null,
		Directories: {},
		
		insertStack: 0,		//for checking whether we're still inserting HTML links before we start erasing files
		updateStack: 0,		//for checking whether we're still downloading the update or not
		updateReady: false,
		downloadError: false,
		
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
			
			var dir = config.dirPrefix;
			if(length > 0){
				dir += "/"+self.Folders[length-1];
			}
			var callback = function(dirObj){
		//		console.log("got folder: "+dir);
				dir = dir.split("/");
				if(dir.length == 1){
					dir = config.dirPrefix;
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
			if(config.logging){
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
				if(config.logging){
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
				config.versionFile,
				success,
				error
			);
		},
		
		performUpdate: function(serverObj){
			var serverStr = JSON.stringify(serverObj);
			//if there is no current version
			if(self.versionObj === null){
				if(config.logging){
					console.log("first download");
				}
				//file isn't found so just save our object there
				FileManager.saveFile(
					self.Directories.current,
					config.versionFile,
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
				if(config.logging){
					console.log("no changes");
				}
				return;
			}
			
			//update required
			if(config.logging){
				console.log("changes needed");
			}
			
			//save our new version file to the newest folder
			FileManager.saveFile(
				self.Directories.newest,
				config.versionFile,
				serverStr
			);
			//build update plan
			self.buildUpdatePlan(serverObj,self.versionObj);
			//download all files to the newest folder
			self.fetchFiles(
				serverObj,
				self.Directories.newest,
				function(){
					if(self.downloadError){
						if(config.logging){
							console.log("download error - update aborted");
						}
						return;
					}
					if(config.logging){
						console.log("update ready");
					}
					//if we want to auto-apply
					if(config.autoUpdate){
						AppManager.reload();
					}
					//if we want to control when the app is updated
					else{
						self.updateReady = true;
					}
				}
			);
		},
		
		buildUpdatePlan: function(serverObj,refObj){
			var changed = false;
			for(var i=0; i<serverObj.length; i++){
				changed = false;
				//check if reference exists
				if(typeof(refObj[i]) === 'undefined'){
					changed = true;
				}
				//if file
				if(serverObj[i].content === null){
					//check if reference is the same
					if(JSON.stringify(serverObj[i].version) != JSON.stringify(refObj[i].version)){
						changed = true;
					}
					serverObj[i].changed = changed;
					if(changed && config.logging){
						console.log("changed:"+serverObj[i].name);
					}
				}
				//if folder that hasn't changed
				else if(!changed){
					self.buildUpdatePlan(serverObj[i].content,refObj[i].content);
				}
			}
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
				self.updateStack++;
				if(config.logging){
					console.log("fetching files");
				}
			}
			
			for(var i=0; i<arr.length; i++){
				//if file
				if(arr[i].content === null){
					var download = (function(){
						var name = arr[i].name;
						return function(e){
							if(e.code !== FileError.NOT_FOUND_ERR){
								//other issue so send to file manager error handler
								FileManager.ErrorFs(e);
								self.updateStack--;
								self.downloadError = true;
								return;
							}
							/******************
							self.updateStack--;
							console.log("needed file: "+name);
							return;
							******************/
							//download the file as it's missing
							var url = FileManager.urlFromDirectoryEntry(folderObj);
							var pos = url.indexOf(config.dirPrefix);
							pos += config.dirPrefix.length + 1;
							url = url.substring(pos);
							pos = url.indexOf("/");
							if(pos > -1){
								url = url.substring(pos);
							}
							url = config.updateURL + "&file=" + encodeURIComponent(url + name);
						/*	if(config.logging){
								console.log("file url: "+url);
							}*/
							var fileTransfer = new FileTransfer();
							fileTransfer.download(
								url,
								FileManager.urlFromDirectoryEntry(folderObj) + name,
								function(){
									if(config.logging){
										console.log("downloaded: "+folderObj.name+"/"+name);
									}
									self.updateStack--;
								},
								function(error) {
									self.updateStack--;
									self.downloadError = true;
									//console.log(JSON.stringify(error));
									console.log("download error: " + error.source + " " + error.target+ " " + error.code);
								},
								true/*,		//trust all hosts
								[options]*/
							);
						};
					})();
					
					self.updateStack++;
					if(typeof(arr[i].changed) === 'undefined' || arr[i].changed){
						//attempt to fetch the file - if successful (already downloaded), do nothing, otherwise download it
						FileManager.getFile(
							folderObj,
							arr[i].name,
							function(fileObj){
								self.updateStack--;
								if(config.logging){
									console.log("already have:"+fileObj.name);
								}
							},
							download
						);
					}
					else{
						//copy the file from current
						var folderName = FileManager.urlFromDirectoryEntry(folderObj);
						folderName = folderName.replace("/newest/","/current/");
						var copyFile = (function(){
							var name = arr[i].name;
							return function(fObj){
								FileManager.getFile(
									fObj,
									name,
									function(fileObj){
										FileManager.copy(
											fileObj,
											folderObj,
											function(){
												self.updateStack--;
												if(config.logging){
													console.log("copied file:"+fileObj.name);
												}
											}
										);
									},
									function(e){
										console.log("failed to get:"+folderName+name);
									}
								);
							};
						})();
						var startCopy = (function(){
							var callback = copyFile;
							var fName = folderName;
							return function(){
								FileManager.getDirectory(
									fName,
									callback
								);
							};
						})();
						//check if we've already copied the file on a previous failed update
						FileManager.getFile(
							folderObj,
							arr[i].name,
							function(fileObj){
								if(config.logging){
									console.log("already copied:"+fileObj.name);
								}
								self.updateStack--;
							},
							startCopy
						);
					}
				}
				//if folder
				else{
					self.updateStack++;
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
			if(config.logging){
				console.log("fetching version data");
			}
			//get server version
			var folder = FileManager.urlFromDirectoryEntry()+config.dirPrefix;
			var fileTransfer = new FileTransfer();
			//prepare a timeout for the file transfer as the plugin doesn't have one
			var transferDone = false;
			setTimeout(
				function(){
					if(!transferDone){
						fileTransfer.abort();
						transferDone = true;
						if(config.logging){
							console.log("version fetch timeout");
						}
					}
				},
				5000
			);
			//initiate download
			fileTransfer.download(
				config.updateURL,
				folder+"/check"+config.versionFile,
				function(){
					transferDone = true;
					//fetch the new file
					var folderObj = self.Directories[config.dirPrefix];
					FileManager.getFile(
						folderObj,
						"check"+config.versionFile,
						function(fileObj){
							FileManager.stringFromFileEntry(
								fileObj,
								function(str){
									var obj = null;
									try{
										obj = JSON.parse(str);
									}
									catch(e){
										if(config.logging){
											console.log("error parsing version info: "+str);
										}
									}
									if(obj !== null){
										if(config.logging){
											console.log("version file parsed");
										}
										//compare and update where needed
										self.performUpdate(obj);
									}
								}
							);
						},
						function(){
							if(config.logging){
								console.log("failed to get checkversion");
							}
						}
					);
				},
				function(error){
					transferDone = true;
					if(config.logging){
						console.log("error fetching version file");
					}
				},
				true/*,		//trust all hosts
				[options]*/
			);
		},
		
		insertIntoHTML: function(folderObj,arr){
			self.insertStack++;
			var root = false;
			if(typeof(folderObj) === 'undefined'){
				root = true;
				folderObj = self.Directories.current;
				arr = self.versionObj;
				if(config.logging){
					console.log("begin html insert ("+arr.length+")");
				}
			}
			
			var cssCallback = function(url){
				var newLink = document.createElement("link");
				newLink.rel = "stylesheet";
				newLink.href = url;
				document.head.appendChild(newLink);
				if(config.logging){
					console.log("css html insert: "+url);
				}
			};
			var jsCallback = function(url){
				var newScript = document.createElement("script");
				newScript.src = url;
				document.head.appendChild(newScript);
				if(config.logging){
					console.log("js html insert: "+url);
				}
			};
			
			for(var i=0; i<arr.length; i++){
				//if file
				if(arr[i].content === null){
					var type = arr[i].name.lastIndexOf(".");
					type = arr[i].name.substring(type+1);
					//if css or js
					if(type == 'css' || type == 'js'){
						if(config.logging){
							console.log("start html insert: "+arr[i].name+", type:"+type);
						}
						self.insertStack++;
						FileManager.getFile(
							folderObj,
							arr[i].name,
							function(fileObj){
								var type = fileObj.name.lastIndexOf(".");
								type = fileObj.name.substring(type+1);
								var url = FileManager.urlFromFileEntry(fileObj);
								if(type == 'css'){
									cssCallback(url);
								}
								else if(type == 'js'){
									jsCallback(url);
								}
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
		
		apply: function(){//self.insertIntoHTML();return;
			//if new version found in newest
			var success = function(fileObj){
				var newestObj = FileManager.stringFromFileEntry(
					fileObj,
					function(str){
						if(config.logging){
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
											self.Directories[config.dirPrefix]
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
													self.Directories[config.dirPrefix]
												);
												//reset current reference
												FileManager.getDirectory(
													"current",
													function(dirObj){
														self.Directories.current = dirObj;
														//load new current
														self.insertIntoHTML();
													},
													self.Directories[config.dirPrefix]
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
				config.versionFile,
				success,
				error
			);
		},
		
		Ready: function(){
			//only use the app manager if this code is actually running in an app
			if(AppManager.isApp){
				if(typeof(navigator.splashscreen) !== 'undefined'){
					setTimeout(
						function(){
							navigator.splashscreen.hide();
						},
						2000
					);
				}
				//check localStorage for config values
				var data = localStorage.getItem("AppManager");
				if(data){
					config = JSON.parse(data);
				}
				
				var callback = function(){
					FileManager.getDirectory(
						config.dirPrefix + "/current/",
						function(folderObj){
							self.oldBase = document.baseURI;
							var baseElm = document.createElement("base");
							baseElm.href = FileManager.urlFromDirectoryEntry(folderObj);
							document.head.appendChild(baseElm);
							if(config.logging){
								console.log("base set to: "+baseElm.href);
							}
							self.FetchFolders();
						}
					);
				}
				
				FileManager.getDirectory(
					config.dirPrefix,
					callback
				);
				
			}
			else{
				self.initApp();
			}
		},
		
		initApp: function(){
			if(typeof(window.app) !== 'undefined' && typeof(app.initialize) === 'function'){
				app.initialize();
				if(config.logging){
					console.log("app initialized");
				}
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
		
		setConfig: function(key,value){
			config[key] = value;
		},
		
		getConfig: function(){
			var data = JSON.stringify(config);
			return JSON.parse(data);
		},
		
		saveConfig: function(){
			localStorage.setItem("AppManager",JSON.stringify(config));
		},
		
		isUpdateReady: function(){
			return self.updateReady;
		},
		
		suspendUpdates: function(){
			
		},
		
		restoreUpdates: function(){
			
		},
		
		reload: function(){
			if(typeof(navigator.splashscreen) !== 'undefined'){
				navigator.splashscreen.show();
			}
			//document.location = self.oldBase;
			// Reload the current page, without using the cache
			setTimeout(
				function(){
					window.location.reload(true);
				},
				100
			);
		},
		
		exit: function(){
			if(typeof(navigator.app)){
				navigator.app.exitApp();
			}
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
