/**
 * Created by tlatoza on 11/23/15.
 */
"use strict";

var express = require('express');
var app = express();
app.set('port',(process.env.PORT || 5000));
var bodyParser = require('body-parser');
app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.set('views', './views');
app.set('view engine', 'mustache');
var Firebase = require("firebase");
var firebaseStudyURL = 'https://programmingstudies.firebaseio.com/studies/microtaskWorkflow/test1';
var pastebinURL = 'https://seecoderun.firebaseapp.com/#-';
var nextSession;             // JSON structure for the next session


// Admin action to initialize a new study by creating a set of workflows.
app.get('/createWorkflows', function (req, res) {
    createWorkflows();
    res.sendFile(__dirname + '/client/successCreatingWorkflows.html');
});

//-----------------------------------------------------------
// First: display the welcome page
//        TODO: draft a disclaimer 
//
//-----------------------------------------------------------
app.get('/', function(req, res){
	res.sendFile(__dirname + '/client/welcome.html');

});


// When a user first hits the study server, first check if they have already participated.
// If not, send them to the screening test.
app.get('/', function (req, res) {
    var workerId = req.query.workerId;

    // Check if there is already data for this worker in Firebase. If there is, the worker has already participated.
    var workerRef = new Firebase(firebaseStudyURL + '/workers/' + workerId);
    workerRef.once('value', function(snapshot) {
        if (snapshot.val() == null)
        {
            // TODO: We need to be able to send back to the client the id of the worker.
            // Options: (1) we could use a templating engine to embed it in the code.
            // Probably need to set up one of the mustache processors.
            // We could also then use templating to set up worker specific content in the templates.
            // Like customizing the instructions. Or hiding or showing the chat system for different versions.

            res.sendFile(__dirname + '/client/screening.html');///?workerId=5'); // ?workerId=' + workerId);
        }
        else
        {
            res.sendFile(__dirname + '/client/alreadyParticipated.html');
        }
    });
});

// After finishing the screening, check if they passed. If so, send them to the demographics page.
app.post('/screenSubmit', function (req, res) {
    // TODO: Check if the user passed the screening test. --> see if the answer matched the answer for question 1
    console.log('screening submitted'); 
    console.log(req.body.question1 + " " + req.body.taskTimeMillis); 

    res.sendFile(__dirname + '/client/demographics.html');

});


// After finishing the demographics sruvey, send the user to the waiting room.
app.post('/demographics', function (req, res) {
    // TODO: store the demographics data to firebase, associated with the participant. // what specific demographic do we send? 

    res.sendFile(__dirname + '/client/waitingRoom.html');
});



// Start the server.
var server = app.listen(app.get('port'), function () {
    var host = server.address().address;
    var port = server.address().port;
    firebaseSetup();
    console.log('http://localhost:' + port + '/');
});

function firebaseSetup()
{
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
        }
    });
}

// Create the workflows on Firebase and the corresponding initial sessions for each workflow.
function createWorkflows()
{
    var totalWorkflowCount = 2;

    var workflows = {};
    var sessions = {};

    // Create a JSON object for each workflow and a corresponding first session for each workflow
    for (var i=0; i < totalWorkflowCount; i++) {
        var workflow = {};
        workflow.workflowURL = pastebinURL + 'workflowAAAA' + i;
        workflow.timeLimitMins = 10;
        workflow.participantsPerSession = 1;
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

// Starts the corresponding session.
function startSession(session, waitlistSnapshot)
{
    // Load status
    var statusRef = new Firebase(firebaseStudyURL + '/status');
    statusRef.once("value", function(snapshot)
    {
        if (snapshot.val() != null)
        {
            var status = snapshot.val();

            // Build the list of IDs for the workers who will be working on this session.
            var workers = {};
            var i = 0;
            waitlistSnapshot.forEach(function(waitlistEntrySnapshot) {
                workers[i] = waitlistEntrySnapshot.val().userID;
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
                var workerWaitlistRef = new Firebase(firebaseStudyURL + '/waitlist/' + waitlistEntrySnapshot.key() +
                    '/sessionURL');
                workerWaitlistRef.set(session.workflowURL);

                i++;
                // If we've selected all of the participants, break.
                if (i >= session.totalParticipants)
                    return true;    // break
            });
             

            // TODO: Set a timeout to be able to end the session when the time is up???
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
