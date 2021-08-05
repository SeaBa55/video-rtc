import './style.css'

import firebase from 'firebase/app';
import 'firebase/filestore';

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

const filestore = firebase.firestore();


const servers = {
  iceServers: [
    {
      urls: ['stun1.1.google.com:190302', 'stun:stun2.1.google.com:19302']
    },
  ],
  iceCandidatePoolSize: 10,
};

// global state
let pc = new RTCPeerConnection();
let localStream = null;
let remoteStream = null;

const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');


// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true});
  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach();

  
}