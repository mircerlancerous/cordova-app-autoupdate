# cordova-app-autoupdate

Framework to automatically update mobile apps based on the cordova framework.
Just tell the app where your update server is and everything is taken care of.
No special plugin required for the auto-update; just ensure your app has a compatible File plugin and you're good to go.

This repo contains both the app code and the server code.
Has an advantage over other implementations as the server code is maintenance-free. Just upload your new production files, and all changes are auto-detected. The server code also supports multiple apps which can be used dev version testing, and supporting multiple production apps.

Currently this project is in the early stages. It works but doesn't have advanced features enabled like restore previous version, and could use some code clean-up.

To use:
1) include all repo JavaScript files making sure the AppManager.js file is last.
2) set the updateURL property at the top of the AppManager.js file. Set the version parameter in the url to the name of the folder you've put your app files into. https://www.test.com/AppUpdate/update.php?version=MyApp
3) Put update.php at the above url and configure it to point to the location of the app files. You do this by setting the DOCROOT define in the middle of the file. define("DOCROOT","/home/myaccount/AppFiles/");
4) Put your app files (htm, css, js) into this folder in a folder as named in your updateURL version parameter.

If you visit that url in a web browser you'll get a JSON representation of your app's files and folders. The update system compares that JSON to one it's stored locally in the app. Any new files are downloaded through update.php to a queue folder in the app. Once all new files are ready, the current files are moved to an archive folder. The new files are then copied into the current folder and the app is restarted.

Whenever the app is loaded it scans the current folder and includes all css and js files it finds into the current html document. If one of those JS files has a global object named 'app' with a method called 'initialize', that method will be called once all file including is complete.

Your file and images references can all be done with relative paths, and will work as they always have.
