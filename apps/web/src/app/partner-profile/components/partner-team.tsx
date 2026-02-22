"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import { fetcher, FetchError } from "@/lib/http/fetcher";
import LoadingTimeout from "@/components/ui/loading-timeout";
import EmptyState from "@/components/ui/empty-state";

type TeamMember = {
  id: string;
  name: string;
  role: string;
  avatar_url?: string;
  bio?: string;
  specialties?: string[];
};

interface PartnerTeamProps {
  slug?: string;
  id?: string;
}

const PartnerTeam: React.FC<PartnerTeamProps> = ({ slug, id: _id }) => {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadTeam = async () => {
      if (!slug) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const response = await fetcher.get<{
          data: TeamMember[];
          error: null;
        }>(`/api/public/providers/${slug}/staff`);
        // API returns { data: Staff[] } directly, not nested in { staff: ... }
        setTeamMembers(Array.isArray(response.data) ? response.data : []);
      } catch (err) {
        const errorMessage =
          err instanceof FetchError
            ? err.message
            : "Failed to load team members";
        setError(errorMessage);
        console.error("Error loading team:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadTeam();
  }, [slug]);

  if (isLoading) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <LoadingTimeout loadingMessage="Loading team..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <EmptyState
          title="Failed to load team"
          description={error}
        />
      </div>
    );
  }

  if (teamMembers.length === 0) {
    return (
      <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
        <h2 className="text-2xl font-semibold mb-6">Team</h2>
        <EmptyState
          title="No team members"
          description="This provider hasn't added team members yet."
        />
      </div>
    );
  }

  return (
    <div className="max-w-[2340px] mx-auto px-4 md:px-10 py-8">
      <h2 className="text-2xl font-semibold mb-6">Team</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {teamMembers.map((member) => (
          <div key={member.id} className="flex flex-col items-center text-center">
            <div className="relative w-20 h-20 mb-3">
              {member.avatar_url ? (
                <Image
                  src={member.avatar_url}
                  alt={member.name}
                  width={80}
                  height={80}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center text-2xl font-semibold text-gray-500">
                  {member.name.charAt(0)}
                </div>
              )}
            </div>
            <p className="font-medium text-sm mb-1">{member.name}</p>
            <p className="text-gray-500 text-xs">{member.role || "Staff"}</p>
            {member.specialties && member.specialties.length > 0 && (
              <p className="text-gray-400 text-xs mt-1">
                {member.specialties.join(", ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PartnerTeam;
