import express from 'express'
import path from 'path'
import cors from 'cors'
import cardsJSON from './data/cards.json'

const app = express()

const __dirname = path.resolve()

app.use(cors())

app.use('/card', express.static(path.join(__dirname, './assets/cards')))

/**
 * Gets all of the cards in a JSON format.
 */
app.get('/cards', (req, res) => {
  res.header('Content-Type', 'application/json')
  res.json(cardsJSON)
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`LISTENING ON PORT ${PORT}`)
})
