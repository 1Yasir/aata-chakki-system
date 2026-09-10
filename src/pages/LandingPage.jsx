import { Clock, MapPin, Phone, Sparkles, Wheat, Wind } from 'lucide-react'
import Navbar from '../components/Navbar'

const services = [
  {
    title: 'Gandum Pisai',
    description: 'Traditional stone-mill grinding for wheat, with consistent particle size for roti and chapati flour.',
    icon: Wheat,
  },
  {
    title: 'Safai / Peen',
    description: 'Cleaning and peen service to remove dust, husk, and stones before grinding.',
    icon: Wind,
  },
  {
    title: 'Pure Desi Aata Sale',
    description: 'Ready-to-cook desi aata from our own stock, packed fresh on the day of sale.',
    icon: Sparkles,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-wheat-50">
      <Navbar />

      <section className="relative overflow-hidden border-b border-wheat-200">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(196,154,60,0.25),_transparent_45%),linear-gradient(180deg,#fbf7ef,_#f4ead4)]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:py-24">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-wheat-500">
              Family mill · Since 1998
            </p>
            <h1 className="font-display text-4xl leading-tight text-mill-900 md:text-6xl">
              Fresh aata, honest rates, daily mill management.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-stone-600">
              We grind wheat the traditional way and keep every maund, unit, and udhaar accounted for.
              Visit the chakki for pisai, safai, and pure desi aata — or sign in to run the daily books.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#services"
                className="rounded-full bg-mill-800 px-5 py-3 text-sm font-semibold text-wheat-100 hover:bg-mill-700"
              >
                View services
              </a>
              <a
                href="#contact"
                className="rounded-full border border-wheat-300 bg-white px-5 py-3 text-sm font-semibold text-mill-800 hover:bg-wheat-100"
              >
                Get directions
              </a>
            </div>
          </div>
          <div className="rounded-[2rem] border border-wheat-200 bg-white/80 p-6 shadow-xl shadow-wheat-200/50">
            <p className="text-sm font-semibold text-wheat-500">Today at the mill</p>
            <dl className="mt-4 grid grid-cols-2 gap-4">
              {[
                ['Pisai rate', 'Rs 80 / maund'],
                ['Peen / safai', 'Rs 40 / maund'],
                ['Hours', '7:00 AM – 8:00 PM'],
                ['Closed', 'Friday jummah 1–2 PM'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl bg-wheat-50 p-4">
                  <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
                  <dd className="mt-1 font-semibold text-mill-900">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section id="services" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl text-mill-900 md:text-4xl">Services</h2>
        <p className="mt-2 max-w-2xl text-stone-600">
          Everything a neighbourhood chakki should offer — grinding, cleaning, and flour you can trust.
        </p>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {services.map((service) => (
            <article
              key={service.title}
              className="rounded-3xl border border-wheat-200 bg-white p-6 shadow-sm"
            >
              <service.icon className="mb-4 h-8 w-8 text-wheat-500" />
              <h3 className="font-display text-2xl text-mill-900">{service.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600">{service.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="rates" className="bg-mill-800 text-wheat-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl md:text-4xl">Rates & business hours</h2>
            <p className="mt-3 text-wheat-200">
              Posted rates are a starting point. Bulk orders and village deliveries can be arranged at the counter.
            </p>
          </div>
          <div id="hours" className="grid gap-4">
            <div className="rounded-3xl bg-mill-700 p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-wheat-300">
                <Clock className="h-4 w-4" /> Hours
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between">
                  <span>Saturday – Thursday</span>
                  <span>7:00 AM – 8:00 PM</span>
                </li>
                <li className="flex justify-between">
                  <span>Friday</span>
                  <span>7:00 AM – 12:30 PM, 2:00 – 8:00 PM</span>
                </li>
              </ul>
            </div>
            <div className="rounded-3xl bg-wheat-100 p-5 text-mill-900">
              <p className="text-sm font-semibold text-wheat-500">Current counter rates</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex justify-between">
                  <span>Gandum pisai</span>
                  <span className="font-semibold">Rs 80 / maund</span>
                </li>
                <li className="flex justify-between">
                  <span>Safai / peen</span>
                  <span className="font-semibold">Rs 40 / maund</span>
                </li>
                <li className="flex justify-between">
                  <span>Pure desi aata</span>
                  <span className="font-semibold">Ask for today’s bag rate</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="font-display text-3xl text-mill-900">Contact</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-wheat-200 bg-white p-5">
            <MapPin className="mb-3 h-5 w-5 text-wheat-500" />
            <p className="font-semibold">Mill floor</p>
            <p className="mt-1 text-sm text-stone-600">Main Bazaar Road, near Grain Mandi, Punjab</p>
          </div>
          <div className="rounded-3xl border border-wheat-200 bg-white p-5">
            <Phone className="mb-3 h-5 w-5 text-wheat-500" />
            <p className="font-semibold">Phone / WhatsApp</p>
            <p className="mt-1 text-sm text-stone-600">0300-000-0000</p>
          </div>
          <div className="rounded-3xl border border-wheat-200 bg-white p-5">
            <Clock className="mb-3 h-5 w-5 text-wheat-500" />
            <p className="font-semibold">Same-day pickup</p>
            <p className="mt-1 text-sm text-stone-600">Bring wheat in the morning for evening aata.</p>
          </div>
        </div>
      </section>

      <footer className="border-t border-wheat-200 py-8 text-center text-sm text-stone-500">
        © {new Date().getFullYear()} Aata Chakki. Fresh mill. Clear books.
      </footer>
    </div>
  )
}
