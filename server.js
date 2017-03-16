/**
 * Created by tlatoza on 11/23/15.
 * updated by Wave Inguane on 03/03/2017.
 */
"use strict";

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var Firebase = require("firebase");
var firebaseStudyURL = 'https://programmingstudies.firebaseio.com/studies/microtaskWorkflow/test1';
var pastebinURL = 'https://seecoderun.firebaseapp.com/#-';
var nextSession;             // JSON structure for the next session
var sessions = {};
var screenTaskTime;          //time spent on screening task
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

    if(result == 7) {
        res.sendFile(__dirname + '/client/demographics.html');
    }
    else
        res.sendFile(__dirname + '/client/failedScreening.html');
});

//..................................................................................................
// After finishing the demographics survey, send the user to the waiting room.
//..................................................................................................
app.post('/waiting_room', function (req, res) {
    // TODO: store the demographics data to firebase, associated with the participant.
    //DONE
    var workerId = req.body.workerID;
    var currstatus = req.body.currentstatus;
    var yearsOfProgramExp = req.body.yearsExp; //just programming experience
    var yearsOfDevExp = req.body.workDevExp; //professional experience

    // Check if there is already data for this worker in Firebase.
    // If there is, the worker has already participated.
    var workerRef = new Firebase(firebaseStudyURL + '/workers/' + workerId);
    workerRef.once('value', function(snapshot) {
        if (snapshot.val() == null) {
            //add new worker
            workerRef.push({
                'workerId': workerId,
                'status': currstatus,
                'languageExp': yearsOfProgramExp,
                'developerExp': yearsOfDevExp,
                'screenTime': screenTaskTime + " ms"
            });
        }
    });

    res.sendFile(__dirname + '/client/waitingRoom.html');
    /*
    //reset
    screenTaskTime = null;

    console.log('WORKER ID: ' + workerId);
    req.setTimeout(86400000, function () {
        req.abort();
        console.log("display after 24 hours");
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
    var totalWorkflowCount = 7;

    var workflows = {};
    //var sessions = {};//moved to global field area


    // Create a JSON object for each workflow and a corresponding first session for each workflow
    for (var i=0; i < totalWorkflowCount; i++) {

        var workflow = {};
        workflow.workflowURL = pastebinURL + 'workflowXYZ' + i;
        workflow.timeLimitMins = 10;
        workflow.participantsPerSession = 2;
        workflow.totalSessions = 1;
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
    console.log('In func firebaseSetup()');
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
//.......................................................................
function startSession(session, waitlistSnapshot)
{
    // Load status
    var nextSessionId;
    var statusRef = new Firebase(firebaseStudyURL + '/status');
    statusRef.once("value", function(snapshot)
    {
        if (snapshot.val() != null)
        {
            var status = snapshot.val();
            nextSessionId = status.nextSessionID;
            console.log("NEXT SESSION: "+ nextSessionId);

            // Build the list of IDs for the workers who will be working on this session.
            var workers = {};
            var i = 0;
            waitlistSnapshot.forEach(function(waitlistEntrySnapshot) {
                workers[i] = waitlistEntrySnapshot.val().workerId;
                i++;

                // If we've selected all of the participants, break.
                if (i >= session.totalParticipants)
                    return true;    // break
            });



            // Record the start time and workers for the session.
            var date = new Date();
            session.startTime = date.toDateString() + ' '  + date.toTimeString();
            session.startTimeMillis = date.getTime();
            session.workers = workers;
            session.sessionID = nextSessionId;
            session.workflowID = nextSessionId;
            session.workflowURL = sessions[session.sessionID].workflowURL;

            var sessionRef = new Firebase(firebaseStudyURL + '/sessions/' + session.sessionID);
            sessionRef.set(session);

            // Increment the next session to be started.
            status.nextSessionID++;
            statusRef.set(status);

            // Add this sessionID to the list of active sessions
            var activeSessionsRef = new Firebase(firebaseStudyURL + '/status/activeSessions');
            activeSessionsRef.push(session.sessionID);

            // Set the sessionURL for each of the first totalParticipants workers on the waitlist.
            // Setting this URL will cause each of these worker clients that are currently waiting to join the session.
            // We do this last to ensure that the session is now fully set up.
            i = 0;
            waitlistSnapshot.forEach(function(waitlistEntrySnapshot) {
                var workerWaitlistRef = new Firebase(firebaseStudyURL + '/waitlist/'
                    + waitlistEntrySnapshot.key() + '/sessionURL');
                workerWaitlistRef.set(session.workflowURL);

                i++;
                // If we've selected all of the participants, break.
                if (i >= session.totalParticipants)
                    return true;    // break
            });


            // TODO: Set a timeout to be able to end the session when the time is up
            //set a timer, end it even if submit is not clicked
            //onDisconnect() on Fire. timer on client side
        }
    });
}

// To be called when a session has been finished.
function sessionCompleted(sessionID) // update Firebase
{
    // Add the sessionID that was just finished --> Add to where? Firebase? Or should I create another array?
    // Check the corresponding workflow to see if there are more sessions for this workflow. If so,
    // create a new session and add it to the end of the session list. // use  if (sessions[workflowID]) == 0? in another function
    // Remove this session from status.activeSessions --> Firebase
    // Each worker should set its logged out time when it leaves session.
    //
}
