/** Offline demo snapshot (matches original mock data shape). Used when Supabase URL/key are placeholders. */

function getDemoSeed() {
  return {
    tables: [
      {
        id: 'demo-table-1',
        name: 'Friday Night Boys',
        code: 'POKER1',
        members: ['Alex', 'Raj', 'Sam', 'Nina', 'Chris'],
        authMembers: ['Alex', 'Raj'],
        games: [
          {
            id: 'demo-g101',
            name: 'Session #12',
            date: '2025-04-28',
            defaultBuyin: 100,
            chipMult: 10,
            peakChips: 0,
            activity: [],
            players: [
              {
                userId: 'name:Alex',
                name: 'Alex',
                buyins: [{ amt: 100, ts: '20:10' }, { amt: 50, ts: '22:00' }],
                clearout: 220,
                sponsorships: []
              },
              {
                userId: 'name:Raj',
                name: 'Raj',
                buyins: [{ amt: 100, ts: '20:10' }],
                clearout: 0,
                sponsorships: []
              },
              {
                userId: 'name:Sam',
                name: 'Sam',
                buyins: [{ amt: 100, ts: '20:10' }, { amt: 50, ts: '21:30' }],
                clearout: 80,
                sponsorships: [{ by: 'Alex', amt: 50, ts: '21:30' }]
              },
              {
                userId: 'name:Nina',
                name: 'Nina',
                buyins: [{ amt: 100, ts: '20:10' }],
                clearout: 0,
                sponsorships: []
              }
            ]
          },
          {
            id: 'demo-g102',
            name: 'Session #11',
            date: '2025-04-14',
            defaultBuyin: 100,
            chipMult: 10,
            peakChips: 0,
            activity: [],
            players: [
              {
                userId: 'name:Alex',
                name: 'Alex',
                buyins: [{ amt: 100, ts: '19:45' }],
                clearout: 60,
                sponsorships: []
              },
              {
                userId: 'name:Raj',
                name: 'Raj',
                buyins: [{ amt: 100, ts: '19:45' }, { amt: 50, ts: '21:00' }],
                clearout: 250,
                sponsorships: []
              },
              {
                userId: 'name:Chris',
                name: 'Chris',
                buyins: [{ amt: 100, ts: '19:45' }],
                clearout: 0,
                sponsorships: []
              }
            ]
          }
        ],
        payments: [
          { id: 'demo-pay-1', from: 'Raj', to: 'Alex', amount: 70, ts: '2025-04-29 10:22', status: 'done' },
          { id: 'demo-pay-2', from: 'Nina', to: 'Alex', amount: 100, ts: '2025-04-29 11:00', status: 'pending' }
        ]
      },
      {
        id: 'demo-table-2',
        name: 'Office Sharks',
        code: 'SHARK7',
        members: ['Alex', 'Tom', 'Lisa'],
        authMembers: ['Tom'],
        games: [
          {
            id: 'demo-g201',
            name: 'Session #5',
            date: '2025-04-20',
            defaultBuyin: 50,
            chipMult: 5,
            peakChips: 0,
            activity: [],
            players: [
              {
                userId: 'name:Alex',
                name: 'Alex',
                buyins: [{ amt: 50, ts: '18:00' }],
                clearout: 30,
                sponsorships: []
              },
              {
                userId: 'name:Tom',
                name: 'Tom',
                buyins: [{ amt: 50, ts: '18:00' }],
                clearout: 110,
                sponsorships: []
              },
              {
                userId: 'name:Lisa',
                name: 'Lisa',
                buyins: [{ amt: 50, ts: '18:00' }],
                clearout: 0,
                sponsorships: []
              }
            ]
          }
        ],
        payments: []
      }
    ]
  };
}

/** Clone demo data and swap the sample player "Alex" for the chosen display name. */
function personalizeDemoTables(displayName) {
  const tables = JSON.parse(JSON.stringify(getDemoSeed().tables));
  function walk(v) {
    if (typeof v === 'string') {
      if (v === 'Alex') return displayName;
      if (v === 'name:Alex') return 'name:' + displayName;
      return v;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const o = {};
      for (const k of Object.keys(v)) o[k] = walk(v[k]);
      return o;
    }
    return v;
  }
  return walk(tables);
}
