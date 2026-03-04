import Array "mo:core/Array";
import Order "mo:core/Order";
import Text "mo:core/Text";
import List "mo:core/List";

actor {
  type ScoreEntry = {
    playerName : Text;
    score : Nat;
  };

  module ScoreEntry {
    public func compare(a : ScoreEntry, b : ScoreEntry) : Order.Order {
      Nat.compare(b.score, a.score);
    };
  };

  let scores = List.empty<ScoreEntry>();

  public shared ({ caller }) func submitScore(playerName : Text, score : Nat) : async () {
    let newEntry : ScoreEntry = {
      playerName;
      score;
    };

    if (scores.size() < 10) {
      scores.add(newEntry);
    } else {
      let sortedScores = scores.toArray().sort();
      let lowestScore = sortedScores[sortedScores.size() - 1];

      if (score > lowestScore.score) {
        scores.clear();
        for (i in Nat.range(0, sortedScores.size() - 1)) {
          scores.add(sortedScores[i]);
        };
        scores.add(newEntry);
      };
    };
  };

  public query ({ caller }) func getTopScores() : async [ScoreEntry] {
    scores.toArray().sort();
  };
};
