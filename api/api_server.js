import express from 'express'
import path from 'path'
import cors from 'cors'
import cardsJSON from './data/cards.json'
import MongoClient from 'mongodb'
import * as socketIO from 'socket.io'
import http from 'http'
import createGameServer from './game_management.js'


const APP = express()
const HTTP = http.Server(APP)

const __dirname = path.resolve()

const URL = 'mongodb://localhost:27017'
const MONGO_CLIENT = new MongoClient(URL)

const DB_NAME = "RingOfFire"

APP.use(cors())
APP.use(express.json())


const io = new socketIO.Server(HTTP, {
  cors: {
    origin: 'http://localhost:8080',
    credentials: true,
    methods: ['GET', 'POST'],
    transports: ['websocket', 'polling'],
  },
  allowEIO3: true,
  'pingInterval': 1200000
});


APP.use('/card', express.static(path.join(__dirname, './assets/cards')))

/**
 * Gets all of the cards in a JSON format.
 */
APP.get('/cards', (req, res) => {
  res.header('Content-Type', 'application/json')
  res.json(cardsJSON)
})

APP.post('/deck', (req, res) => {
  add_deck (req.body)
    .then (_ => res.sendStatus(200))
    .catch (_ => {
      console.log(_)
      res.sendStatus(500)
    }) // TODO: In detail error.
})

APP.get('/decks', (req, res) => {
  get_decks()
    .then(decks => res.json(decks))
    .catch(_ => res.sendStatus(500))  // TODO: In detail error.
})

// Set up the socket events
createGameServer(io)

const PORT = process.env.PORT || 3000

HTTP.listen(PORT, () => {
  console.log(`LISTENING ON PORT ${PORT}`)
})

let db = null

setup_database()
  .then(_ => console.log(`DB CONNECTED`))
  .catch(err => console.log(err));

// Setting up the database
async function setup_database () {
  return MongoClient.connect (URL, (err, dbObj) => {
    if (err) throw err

    db = dbObj.db('RingOfFire')
  })
}

async function add_deck (deckToAdd) {
  
  if (db == null) {
    throw new Error("the database is not setup")
  }

  return await db.collection("Decks").insertOne(deckToAdd)
}

async function get_decks () {
  if (db == null) {
    throw new Error("the database is not setup")
  }

  return await db.collection("Decks").find({}).toArray()
}

