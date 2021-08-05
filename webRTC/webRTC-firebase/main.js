import './style.css'

import firebase from 'firebase/app';
import 'firebase/firestore';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
var firebaseConfig = {
  apiKey: "AIzaSyAtgoeugUvh6E4e5bOF7vNTXy4QCHKB0as",
  authDomain: "server-61cc8.firebaseapp.com",
  projectId: "server-61cc8",
  storageBucket: "server-61cc8.appspot.com",
  messagingSenderId: "714072976475",
  appId: "1:714072976475:web:746b81d42249ca114fa37e",
  measurementId: "G-93B7FHEXWM"
};
// Initialize Firebase

if (firebase.app.length) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();

// Using specific STUN servers
const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global state
const pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Setup media sources
webcamButton.onclick = async () => {
  // Obtain stream from user web cam. When complete, the promise will resolve in a MediaStream Object
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true});

  // Establish an Empty remote stream MediaStream Object. 
  remoteStream = new MediaStream();

  // Now make both MediaStreams availible on the peer connection.
  // Local stream is already running in the browser, so we can get each track and push them to the peer connection.
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Remote stream is empty, and will be updated by the peer connnection itself.
  // Listen to the ontrack event and pull tracks form incoming stream, then add stream to remoteStream Object.
  pc.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  // Last, apply both stream Objects to their respective video elements in the DOM. 
  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  // Enable the call and answer buttons; disable the web cam button.
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// Now we have a way to manage a local and remote stream through the peer connection, but in order to make this happen we need to do some signaling with a third party server.

// 2. Create an offer - the user who initiates a call is the one that makes an offer.
callButton.onclick = async () => {

  // Reference firestore collection - we have a call document, which is used to manage the answer and offer from both users
  const callDoc = firestore.collection('calls').doc();
  // Offer and answer candidates is a sub collection under the call document, which contains all the candidates for each of those users.
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');

  // When we reference a docuemnt without an id, firebase will automatically generate a random id for us.
  // We use this random id to populate an input in the UI, which can then be used in another browser tab or by another user in the world to answer the call
  callInput.value = callDoc.id;

  // When we call set local description, the peer connection automatically started generating the ice candidates.
  // An ice candidate contains a potential ip address and port pair, that can be used to establish the actual peer to peer connection.

  // Get candidates for caller, save to db - we need to be listening to the ice candidates, so we establish an on ice candidate listener.
  pc.onicecandidate = (event) => {
    // when the event is fire, we makes sure that the candidate exists, then write the data as JSON to the offer candidates collection.
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer - await the peer connection create offer method, which will return with an offer description.
  const offerDescription = await pc.createOffer();
  // Then we set it as a local description on the peer connection. This Object contains an Session Description Protcol (SDP) value, which we want to save to the database.
  await pc.setLocalDescription(offerDescription);

  // Session Description Protcol - convert offer description Object to a plain JavaScript Object
  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // Write the new offer Object to the database.
  await callDoc.set({ offer });

  // Listen for remote answer and when answer is recieved update peer connection - firebase implementation
  // We are listening to changes to the call document in firestore, to access answers from user on other side.
  // On snapshot method will fire a callback anytime the document in the database changes. 
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    // If peer connection doesnt have any remote description and the data has an answer, then we go ahead and set an answer description on our peer connection here locally.
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
    // Summary: we listen to our database for an answer and when that answer is recieved, we update it on our peer connection.
    // This negotiates the initial connection, but we also need to listen for ice candidates from the answering user.
  });

  // We can do that by listening to updates to the answer candidates collection. 
  // Firestore has a feature where you can listen to only the documents that have been added to the collection, which is handeled with the doc changes method on the query.
  // Wenever we have a new document added we can then create a new ice candidate with the document data, and the add that candidate to our peer connection. 
  // When answered, add candidate to peer connection - firebnase implementation
  answerCandidates.onSnapshot(snapshot => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      };
    });
  });
  // Summary: at this point, we're listening to updates from the answer side, but we still need to give the answering user a way to actuially answer the call.
  // Answering a call is very similar to initiating a call, with the main difference being that we are going to listen to a document in firestore with the same document id created by the caller.
  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  // We make a reference to the specific call document established by the originator, by using the id value from the input field where it was stored when the user created the call.
  const callId = callInput.value;
  const callDoc = firestore.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');

  // Listen to ice candidate event on the peer connection to update the answer candidates collection whenver a new candidate is created. 
  pc.onicecandidate = event => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  // Fetch call document from database and add its data to callData.
  const callData = (await callDoc.get()).data();

  // Call data contains the offer data which we can then use to set a remote description on the peer connection.
  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  // Now we can generate an answer locally with the create answer method, then set the local description as the answer/
  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  // Just like we did with the offer in the previous function, we set the answer as a plain object in order to update it on the call document.
  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  // Update the answer on the call document, so that the other user can listen to the answer.
  await callDoc.update({ answer })

  // Now we set up a listener on the offer candidates collection and whenever a new ice candidate is added to that collection, then we can go aheead and create an ice candidate locally.
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change)
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};