import { ArrowUpRight, Heart, Megaphone, Users, Waves } from "lucide-react";
import { Link } from "react-router-dom";

export function PublicAbout() {
  return (
    <article className="brm-about">
      <header className="about-intro">
        <span className="home-eyebrow">
          <Waves size={16} /> ABOUT ADOPTION.IS
        </span>
        <h1>
          Good causes deserve
          <br />
          to be heard.
        </h1>
        <p className="about-lead">
          A good story can move someone. A community can help it move further.
        </p>
        <div className="about-why">
          <span className="home-eyebrow">OUR MISSION & VISION</span>
          <div>
            <p>
              [Mission statement placeholder — share adoption.is’s purpose,
              who we serve, and how we make a difference.]
            </p>
            <p>
              [Vision statement placeholder — describe the future adoption.is
              is working toward and the lasting impact we hope to create.]
            </p>
          </div>
        </div>
      </header>
      <section
        id="about-how"
        className="about-section"
        aria-labelledby="about-how-title"
      >
        <span className="home-eyebrow">THE POWER OF REACH</span>
        <h2 id="about-how-title">It starts with a story.</h2>
        <ol className="about-steps">
          <li>
            <span>01</span>
            <div>
              <h3>A cause gives it meaning.</h3>
              <p>
                Organizations bring a mission and a project worth talking about.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>A creator makes it connect.</h3>
              <p>
                Creators turn that mission into an ad people can watch,
                understand, and care about.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>A community helps it travel.</h3>
              <p>
                Viewers discover the stories and can support ad spend to help
                them reach more people. A donation to the cause is a separate
                kind of support.
              </p>
            </div>
          </li>
        </ol>
      </section>
      <section
        id="about-community"
        className="about-section"
        aria-labelledby="about-community-title"
      >
        <span className="home-eyebrow">MADE FOR PEOPLE WHO CARE</span>
        <h2 id="about-community-title">Everyone has a part to play.</h2>
        <div className="about-people">
          <div>
            <Megaphone size={22} />
            <h3>Creators</h3>
            <p>
              Put your creativity behind a cause. Make stories with purpose and
              earn a share of the ad funding your work receives.
            </p>
          </div>
          <div>
            <Heart size={22} />
            <h3>Organizations</h3>
            <p>
              Give your mission a voice. Bring a project to a community of
              creators and supporters who can help tell its story.
            </p>
          </div>
          <div>
            <Users size={22} />
            <h3>Supporters</h3>
            <p>
              Start by watching. Get to know a cause, find a story you believe
              in, and choose how you want to help it go further.
            </p>
          </div>
        </div>
        <Link to="/explore" className="button primary">
          Find a story that moves you <ArrowUpRight size={16} />
        </Link>
      </section>
      <section
        id="about-demo"
        className="about-section about-demo"
        aria-labelledby="about-demo-title"
      >
        <h2 id="about-demo-title">Explore the idea in this working demo.</h2>
        <p>
          You can browse without an account, watch ads, compare sample results,
          and create a viewer profile to try funding ad spend. Simulated ad-fund
          contributions include a 10% creator share and stay separate from gifts
          to the cause.
        </p>
        <p>
          Profiles and contributions are saved in your browser. Performance is
          illustrative; this demo does not collect payments or deliver live ads.
          Use <strong>Preview as</strong> to explore the Creator, Campaign
          Owner, and Admin workspaces.
        </p>
      </section>
    </article>
  );
}
