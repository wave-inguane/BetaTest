/**
 * Created by tlatoza on 11/23/15.
 * updated by Wave Inguane on 04/13/2017.
 */
"use strict";

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var Firebase = require("firebase");
var firebaseStudyURL = 'https://programmingstudies.firebaseio.com/studies/microtaskWorkflow/test1';
//var pastebinURL = 'https://seecoderun.firebaseapp.com/#-';
var pastebinURL = 'https://seecoderun.firebaseio.com/test/-workflowXYZ0/content/share/events';
var nextSession;
var nextSessionId = 0;
var multipleStepsSessionID = 0;
var actualNextSessionID = 0;
var sessions = {};
var sessionMembers = {};
var activeSessions = {};
var screenTaskTime;          //time spent on screening task
var flag = false;
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('client'));
app.set('port',(process.env.PORT || 8888));
//app.set('views', './views');
//app.set('view engine', 'mustache');

//Admin action to initialize a new study by creating a set of workflows.
app.get('/createWorkflows', function (req, res) {
    createWorkflows();
    res.sendFile(__dirname + '/client/successCreatingWorkflows.html');
});

//TODO: draft a disclaimer
// Do we keep a record that the participant agreed to the terms of usage
// or we just let them proceed to the screening task after they have accepted
// the terms and conditions to participate ?
// What if they don't click Accept button ?
app.get('/', function(req, res){
    res.sendFile(__dirname+'/client/welcome.html');
});

//.........................................................................................
// When a user first hits the study server, first check if they have already participated.
// If not, send them to the screening test.
//.........................................................................................

app.post('/screening_task', function (req, res) {

    res.sendFile(__dirname + '/client/screening.html');
    // res.sendFile(__dirname + '/client/alreadyParticipated.html');
});

//.................................................................................................
// After finishing the screening, check if they passed. If so, send them to the demographics page.
//.................................................................................................
app.post('/screen_submitted', function (req, res) {
    screenTaskTime = req.body.taskTimeMillis;
    var result = req.body.question1;

    console.log('screening submitted');
    console.log(result + " " + screenTaskTime);

    if((result == 7)  &&   (screenTaskTime <= 600000)) {//10 min
        res.sendFile(__dirname + '/client/demographics.html');
    }
    else
        res.sendFile(__dirname + '/client/failedScreening.html');
});

//..................................................................................................
// After finishing the demographics survey, send the user to the waiting room.
//..................................................................................................
app.post('/ProgrammingStudy', function (req, res) {
    // TODO: store the demographics data to firebase, associated with the participant.
    //DONE
    var workerId = req.body.workerID;
    var currentStatus = req.body.currentstatus;
    var yearsOfProgramExp = req.body.yearsExp; //just programming experience
    var yearsOfDevExp = req.body.workDevExp; //professional experience
    var demCollectionTime = req.body.demographicsCollectTimeMillis;

    // Check if there is already data for this worker in Firebase.
    // If there is, the worker has already participated.
    var workerRef = new Firebase(firebaseStudyURL + '/workers/' + workerId);
            //add new worker
            workerRef.push({
                'workerId': workerId,
                'status': currentStatus,
                'languageExp': yearsOfProgramExp,
                'developerExp': yearsOfDevExp,
                'screenTime': screenTaskTime,
                'demCollectionTime': demCollectionTime
            });

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.sendFile(__dirname + '/client/waitingRoom.html');
    /*  no dups
    var flag = false;
    workerRef.once("value", function(snapshot){
        //for each key in users
        snapshot.forEach(function (childSnapshot){
            var userId = childSnapshot.val().workerId;//['workerId'];
            if(workerId == userId){
                flag = true;
            }
        });

        //new email, valid registration
        if(!flag) {
            //add new worker
            workerRef.push({
                'workerId': workerId,
                'status': currstatus,
                'languageExp': yearsOfProgramExp,
                'developerExp': yearsOfDevExp,
                'screenTime': screenTaskTime + " ms"
            });
            res.sendFile(__dirname + '/client/waitingRoom.html');
        }
        else {
            res.sendFile(__dirname + '/client/alreadyParticipated.html');
        }
    });
*/
});

// Start the server.
var server = app.listen(app.get('port'), function () {
    var host = server.address().address;
    var port = server.address().port;

    if (nextSession == null) //SETUP FOR TESTING
        createWorkflows();
     firebaseSetup();

    console.log('http://localhost:' + port + '/');
});

//..............................................................................................
// Create the workflows on Firebase and the corresponding initial sessions for each workflow.
//..............................................................................................
function createWorkflows()
{
    var totalWorkflowCount = 4;

    var workflows = {};
    //var sessions = {};//moved to global field area

    // Create a JSON object for each workflow and a corresponding first session for each workflow
    for (var i=0; i < totalWorkflowCount; i++) {

        var workflow = {};
        workflow.workflowURL = pastebinURL;//+'workflowXYZ' + i;

        workflow.timeLimitMins = 10;
        workflow.participantsPerSession = 2;
        workflow.totalSessions = Math.floor((Math.random() * 4) + 1);
        var workflowID = i;
        workflows[workflowID] = workflow;

        var session = {};
        session.sessionID = i;
        session.workflowID = i;
        session.workflowURL = workflow.workflowURL;
        session.timeLimitMins = workflow.timeLimitMins;
        session.totalParticipants =  workflow.participantsPerSession;
        sessions[workflowID] = session;
    }

    // Create the initial status, setting up the first session and the current total number of sessions.
    var status = {};
    status.nextSessionID = 0;
    status.totalSessions = totalWorkflowCount;

    var workflowsRef = new Firebase(firebaseStudyURL + '/workflows');
    workflowsRef.set(workflows);

    var sessionsRef = new Firebase(firebaseStudyURL + '/sessions');
    sessionsRef.set(sessions);


    var statusRef = new Firebase(firebaseStudyURL + '/status');
    statusRef.set(status);

    nextSession = sessions[0];
}

//............................................................................................
// Create wait list
//............................................................................................
function firebaseSetup()
{
   // console.log('In func firebaseSetup()');
    var waitListRef = new Firebase(firebaseStudyURL + '/waitlist');

    // Watch for additions to the waitingList. Once the waiting list meets or exceeds the size of the
    // number of participants required for the nextSession, start the session.
    waitListRef.on("value", function(snapshot) {

        if (nextSession != null)
        {
            var waitlistSizeEstimate = snapshot.numChildren();
            var participantsRequired = nextSession.totalParticipants;
            if (waitlistSizeEstimate >= participantsRequired)
            {
                // There may be participants on the waitlist that have already had a session assignment.
                // If this is the case, do not count these participants.
                // To calculate the actual size of the waitlist, loop over the participants.
                var waitListSize = 0;
                snapshot.forEach(function(childSnapshot) {
                    if (!childSnapshot.val().hasOwnProperty('sessionURL'))
                        waitListSize++;
                });

                if (waitListSize >= participantsRequired)
                {
                    startSession(nextSession, snapshot);
                }
            }
        } //end if
    });
}

//.......................................................................
// Starts the corresponding session.
// nextSessionID is the key the actual sessionID is found in sessions
//.......................................................................
function startSession(session, waitlistSnapshot)
{
    // Load status
    var statusRef = new Firebase(firebaseStudyURL + '/status');
    statusRef.once("value", function(snapshot)
    {
        if (snapshot.val() != null)
        {
            var status = snapshot.val();
            nextSessionId = status.nextSessionID;
            //console.log("NEXT SESSION: "+ nextSessionId);

            // Build the list of IDs for the workers who will be working on this session.
            //var workers = {}; //@global
            var i = 0;
            waitlistSnapshot.forEach(function(waitlistEntrySnapshot) {
                sessionMembers[i] = waitlistEntrySnapshot.val().workerId;
                i++;

                // If we've selected all of the participants, break.
                if (i >= session.totalParticipants)
                    return true;    // break
            });


            // Record the start time and workers for the session.
            /*
            var date = new Date();
            session.startTime = date.toDateString() + ' '  + date.toTimeString();
            session.startTimeMillis = Firebase.ServerValue.TIMESTAMP;//date.getTime();
            session.sessionMembers = sessionMembers;
            session.sessionID = nextSessionId;
            session.workflowID = nextSessionId;
            session.workflowURL = sessions[session.sessionID].workflowURL;
            var sessionRef = new Firebase(firebaseStudyURL + '/sessions/' + session.sessionID);
            sessionRef.set(session);
            */

            //https://firebase.google.com/docs/database/admin/save-data
            //update the session
            var date = new Date();
            session.startTime = date.toDateString() + ' '  + date.toTimeString();
            session.startTimeMillis = Firebase.ServerValue.TIMESTAMP;
            session.sessionMembers = sessionMembers;
            //session.sessionID = nextSessionId;
            //session.workflowID = nextSessionId;
            //session.workflowURL = sessions[session.sessionID].workflowURL;


            session.sessionID = sessions[nextSessionId].workflowID;
            //console.log("Updating ++++++ Next sessionID : "+ nextSessionId);
            session.workflowID = sessions[nextSessionId].workflowID;
            session.workflowURL = sessions[nextSessionId].workflowURL;

            var sessionRef = new Firebase(firebaseStudyURL + '/sessions/' + nextSessionId);
            //var sessionRef = new Firebase(firebaseStudyURL + '/sessions/' + session.sessionID);
            sessionRef.set(session);
            //sessionRef.set(session);

            // Increment the next session to be started.
            status.nextSessionID++;
            statusRef.set(status);

            // Add this sessionID to the list of active sessions
            var activeSessionsRef = new Firebase(firebaseStudyURL + '/status/activeSessions');
            activeSessionsRef.push({"sessionID" : session.sessionID});

            // Set the sessionURL for each of the first totalParticipants workers on the waitlist.
            // Setting this URL will cause each of these worker clients that are currently waiting to join the session.
            // We do this last to ensure that the session is now fully set up.
            i = 0;
            waitlistSnapshot.forEach(function(waitlistEntrySnapshot) {
                var workerWaitlistRef = new Firebase(firebaseStudyURL + '/waitlist/' + waitlistEntrySnapshot.key() + '/sessionURL');
                var str = session.workflowURL;
                workerWaitlistRef.set(str);


                var index = status.nextSessionID - 1
                var urlRef = new Firebase(firebaseStudyURL + '/sessions/' + index);
                urlRef.once('value', function (snapshot) {
                    snapshot.forEach(function (childSnapshotP) {
                        var childKey = childSnapshotP.key();
                        if (childKey == 'workflowURL') {

                            workerWaitlistRef.update({'workflowURL': childSnapshotP.val()});
                            //console.log("URL: " + childSnapshotP.val() + "\n");

                        }
                    });
                });




                i++;
                // If we've selected all of the participants, break.
                if (i >= session.totalParticipants) {
                    return true;    // break
                }
            });



            // TODO: Set a timeout to be able to end the session when the time is up
            //set a timer, end it even if submit is not clicked
            //onDisconnect() on Fire. timer on client side
            //DONE              15000
            setTimeout(timeOut, 600000, nextSessionId);//10min

        }
    });

}

//Timer
function timeOut (sessionID) {
  //  console.log('session => ' + sessionID + " timed out");
    var timeOutData = {
        sessionEndedTimeMillis : Firebase.ServerValue.TIMESTAMP,
        done: "done"
    };

    var sessionRef = new Firebase(firebaseStudyURL + '/sessions/' + sessionID);
    sessionRef.update(timeOutData);

    //sessionRef.update({sessionEndedTimeMillis : Firebase.ServerValue.TIMESTAMP});
    // sessionRef.update({done: "done"});

    sessionCompleted(sessionID);

}


// To be called when a session has been finished.
function sessionCompleted(sessionID) // update Firebase
{
    //1. Add the sessionID that was just finished --> Add to where? Firebase? Or should I create another array?
    //2. Check the corresponding workflow to see if there are more sessions for this workflow. If so,
    // create a new session and add it to the end of the session list. // use  if (sessions[workflowID]) == 0? in another function
    //3. Remove this session from status.activeSessions --> Firebase
    //4. Each worker should set its logged out time when it leaves session.


    //1. Add the sessionID that was just finished to Firebase
    var compSessionsRef = new Firebase(firebaseStudyURL + '/sessions/completed/');
        compSessionsRef.push({"sessionID" : sessionID});


    //2.Check the corresponding workflow to see if there are more sessions for this workflow.
    // If so,
    // create a new session and add it to the end of the session list. // use  if (sessions[workflowID]) == 0? in another function
    //find corresponding workfolow

    var queryX = new Firebase(firebaseStudyURL + '/sessions/'+sessionID);
    queryX.once("value").then(function(snapshotX) {
        snapshotX.forEach(function (childSnapshotX) {
            //var childDataX = childSnapshotX.key();
              if("sessionID" == childSnapshotX.key()) {
                  //.........................................................................................................
                  console.log(".........\n" + " DEBUGGER " + "actualNextSessionIDs " + childSnapshotX.val() + "\n..........");
                  //.........................................................................................................
                  var totalSessionsRef = new Firebase(firebaseStudyURL + '/workflows/' + childSnapshotX.val());
                  //read all children of the ref
                  totalSessionsRef.once('value', function (snapshot) {
                      snapshot.forEach(function (childSnapshot) {
                          var childKey = childSnapshot.key();
                          //DEBUG
                          if ((childKey == 'totalSessions') && (childSnapshot.val() > 0)) {
                              //update totalSessions
                              totalSessionsRef.update({'totalSessions': childSnapshot.val() - 1}).then(function () {
                                  console.log("Session update succeeded.");
                                  //INVOKE
                                  getNextSessionKey(sessionID);
                              }).catch(function (error) {
                                  console.log("Session update failed: " + error.message);
                              });
                          }
                      });
                  });

              }
        });
    });


    //3. Remove this session from status.activeSessions --> Firebase
    //List active sessions
    var queryA = new Firebase(firebaseStudyURL + '/status/activeSessions');
    queryA.once("value").then(function(snapshotA) {
            snapshotA.forEach(function(childSnapshotA) {
                // childDataA will be the actual contents of the child
                var childDataA = childSnapshotA.val().sessionID;
               // console.log("childA " + childDataA);
                if((childDataA == sessionID)){
                    var adaRef = new Firebase(firebaseStudyURL + '/status/activeSessions/'+ childSnapshotA.key() +'/sessionID');
                    adaRef.remove().then(function() {
                            console.log("Remove activeSession succeeded.");
                        }).catch(function(error) {
                            console.log("Remove activeSession failed: " + error.message);
                        });

                    return true;
                }
            });
        });

    //4. Each worker should set its logged out time when it leaves session.
    //DONE on the client side

}//-----------------------------------end---------------------------------------
 //-----------------------------------------------------------------------------

function getNextSessionKey(sessionID){

    //getNextSession
    var queryA = new Firebase(firebaseStudyURL + '/status');
    queryA.once("value").then(function(snapshotA) {
        snapshotA.forEach(function(childSnapshotA) {
            // childDataA will be the actual contents of the child
            var childKey = childSnapshotA.key();
            if((childKey == 'totalSessions')){

                //update total sessions
                var nextSessionKey = childSnapshotA.val() + 1;
                queryA.update({"totalSessions": nextSessionKey});

               updateSession(nextSessionKey, sessionID);
            }

        });
    });
}

function updateSession(i, sessionID){
    //create a new session and add it to the end of the session list.
    var sessionsRef = new Firebase(firebaseStudyURL + '/sessions');
    var session = {};
    var sessions2 = {};

    getNextSessionID(function(next) {
        multipleStepsSessionID = next;
        actualNextSessionID = next;
       // console.log("actual NEXT SESSION IS : " + next);

        var urlRef = new Firebase(firebaseStudyURL + '/sessions/' + next);
        urlRef.once('value', function (snapshot) {
            snapshot.forEach(function (childSnapshotP) {
                var childKey = childSnapshotP.key();

                if (childKey == 'workflowID') {

                    var urlRef = new Firebase(firebaseStudyURL + '/workflows/' + childSnapshotP.val());

                    urlRef.once('value', function (snapshot) {
                        snapshot.forEach(function (childSnapshot) {
                            var childKey = childSnapshot.key();

                            //TODO check if all sections have been completed
                            // Before generating new session

                            if ((childKey == 'workflowURL')) {
                                i = i - 1;
                                session.sessionID = next;
                                session.workflowID = next;
                                session.workflowURL = childSnapshot.val();
                                session.timeLimitMins = 10;
                                session.totalParticipants = 1;
                                sessions2[i] = session;
                                sessions[i] = session;
                                sessionsRef.update(sessions2);
                                removeDoneFlag();
                                return true;
                            }
                        });
                    });

                }
            });
        });
        return true;
    });

}

function getNextSessionID(callback) {

    var queryA = new Firebase(firebaseStudyURL + '/sessions/');
    queryA.once("value").then(function(snapshotA) {
        snapshotA.forEach(function(childSnapshotA) {
            if(childSnapshotA.val().hasOwnProperty('done'))
            {
                var queryB = new Firebase(firebaseStudyURL + '/sessions/' + childSnapshotA.key());
                queryB.once("value").then(function (snapshotB) {
                    snapshotB.forEach(function (childSnapshotB) {
                        var childBKey = childSnapshotB.key();
                        if (childBKey == 'sessionID') {
                            var actualNextSession = childSnapshotB.val();
                            callback(actualNextSession);
                        }
                    });
                });
            }
        });
    });
    //return value, not applicable
}

//-----------------------------------------------------------------------------
// Remove routine
//----------------------------------------------------------------------------
function removeDoneFlag() {
    var queryA = new Firebase(firebaseStudyURL + '/sessions/');
    queryA.once("value").then(function(snapshotA) {
        snapshotA.forEach(function(childSnapshotA) {
            var queryB = new Firebase(firebaseStudyURL + '/sessions/'+childSnapshotA.key());
            queryB.once("value").then(function(snapshotB) {
                snapshotB.forEach(function(childSnapshotB) {

                    var childBKey = childSnapshotB.key();
                    if(childBKey == 'done'){
                        var removeRef = new Firebase(firebaseStudyURL + '/sessions/' + childSnapshotA.key() + '/done');
                        removeRef.remove().then(function () {
                            console.log("Remove succeeded on doneRef.");
                        }).catch(function (error) {
                            console.log("Remove failed on doneRef: " + error.message);
                        });
                        return true;
                    }else{
                       // console.log(" DID NOT REMOVE " +childBKey);
                    }
                });
            });
        });
    });
}
